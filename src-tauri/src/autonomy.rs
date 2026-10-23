use std::{path::PathBuf, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}, time::{Duration, Instant}};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;
use crate::{autonomy_core::*, application_registry::{Entry, available}};

#[derive(Clone)] enum Destination { Registered(Entry), Installed(String), Folder(PathBuf) }
struct Candidate { id: String, name: String, label: String, destination: Destination, aliases: Vec<String> }
#[derive(Default)] pub struct Autonomy(Mutex<Confirmations<Destination>>);
#[derive(Default)] pub struct Session { apps: Option<Vec<Candidate>>, revealed_apps:std::collections::HashSet<String>, folders: Vec<Candidate>, pub proposed: bool }

#[cfg(windows)] fn windows_apps(cancel: &AtomicBool) -> Result<Vec<InstalledApp>, String> {
    use std::{io::Read, process::{Command, Stdio}, os::windows::process::CommandExt};
    // Fixed script only. User/model text is NEVER interpolated into PowerShell.
    let script = "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); ConvertTo-Json -InputObject @(Get-StartApps | Select-Object Name,AppID) -Compress";
    let root = std::env::var_os("SystemRoot").map(PathBuf::from).ok_or("No se encontró Windows.")?;
    let mut child = Command::new(root.join("System32/WindowsPowerShell/v1.0/powershell.exe")).args(["-NoLogo","-NoProfile","-NonInteractive","-Command",script]).creation_flags(0x08000000).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().map_err(|_| "No se pudo consultar las aplicaciones instaladas.")?;
    let stdout = child.stdout.take().ok_or("No se pudo consultar Windows.")?;
    let reader = std::thread::spawn(move || { let mut bytes=Vec::new(); stdout.take(2*1024*1024+1).read_to_end(&mut bytes).map(|_|bytes) });
    let started=Instant::now();
    loop {
        if cancel.load(Ordering::Relaxed) || started.elapsed()>Duration::from_secs(12) {
            let _=child.kill(); let _=child.wait(); let _=reader.join();
            return Err(if cancel.load(Ordering::Relaxed) {"Consulta cancelada."} else {"Windows tardó demasiado al listar aplicaciones. Volvé a intentar."}.into());
        }
        match child.try_wait() {
            Ok(Some(status)) => { let bytes=reader.join().map_err(|_|"Falló la consulta de aplicaciones.")?.map_err(|_|"No se pudo leer la lista de Windows.")?; if !status.success(){return Err("Windows no pudo listar las aplicaciones instaladas.".into());} return installed_apps(&bytes); },
            Ok(None) => std::thread::sleep(Duration::from_millis(40)),
            Err(_) => {let _=child.kill();let _=child.wait();let _=reader.join();return Err("No se pudo consultar Windows.".into());}
        }
    }
}
#[cfg(not(windows))] fn windows_apps(_cancel: &AtomicBool) -> Result<Vec<InstalledApp>,String> { Err("La búsqueda de aplicaciones instaladas requiere Windows.".into()) }

impl Session {
    pub fn execute(&mut self, app: &AppHandle, name: &str, args: Value, cancel: &Arc<AtomicBool>) -> Result<Value,String> {
        if cancel.load(Ordering::Relaxed) {return Err("Consulta cancelada.".into());}
        let args=arguments(args)?;
        match name {
            "get_current_time" => time_at(&query(&args,"timezone")?,chrono::Utc::now()),
            "search_applications" => {
                let q=query(&args,"query")?;
                if self.apps.is_none() {
                    let mut apps:Vec<_>=crate::applications::configured(app)?.into_iter().filter(available).map(|entry|Candidate{id:String::new(),name:entry.name.clone(),label:crate::application_registry::view(&entry).target,aliases:entry.aliases.clone(),destination:Destination::Registered(entry)}).collect();
                    for entry in windows_apps(cancel)? {
                        if apps.iter().any(|a|crate::application_intent::normalized(&a.name)==crate::application_intent::normalized(&entry.name)){continue;}
                        apps.push(Candidate{id:String::new(),name:entry.name,label:format!("Aplicación de Windows · {}",entry.app_id),aliases:vec![],destination:Destination::Installed(entry.app_id)});
                    }
                    for (i,a) in apps.iter_mut().enumerate(){a.id=format!("app-{i}");} self.apps=Some(apps);
                }
                let mut found:Vec<_>=self.apps.as_ref().unwrap().iter().filter_map(|a| {let rank=std::iter::once(&a.name).chain(&a.aliases).map(|n|score(n,&q)).max().unwrap_or(0);(rank>0).then_some((rank,a))}).collect();
                found.sort_by(|a,b|b.0.cmp(&a.0).then(a.1.name.cmp(&b.1.name)));let total=found.len();
                let matches:Vec<_>=found.into_iter().take(12).map(|(_,a)|{self.revealed_apps.insert(a.id.clone());json!({"id":a.id,"name":a.name,"target":a.label})}).collect();
                Ok(json!({"query":q,"matches":matches,"total":total,"truncated":total>12}))
            },
            "search_folders" => {
                let q=query(&args,"query")?;
                let result=crate::assistant_core::search_folders(crate::assistant::roots(),&q,cancel,Duration::from_secs(15),300000);
                if result.cancelled{return Err("Búsqueda cancelada.".into());}
                let mut found=vec![];
                for f in result.matches { let id=format!("folder-{}",self.folders.len());found.push(json!({"id":id,"name":f.name,"path":f.path,"exact":f.exact}));self.folders.push(Candidate{id,name:f.name,label:f.path.display().to_string(),destination:Destination::Folder(f.path),aliases:vec![]}); }
                Ok(json!({"query":q,"matches":found,"incomplete":result.incomplete,"skipped":result.skipped,"note":"Buscar no comparte ni lee el contenido de las carpetas."}))
            },
            "open_application"|"open_folder" => {
                if self.proposed { return Err("Ya hay una apertura pendiente de confirmación.".into()); }
                let id=query(&args,"id")?;
                if name=="open_application"&&!self.revealed_apps.contains(&id){return Err("Ese destino no fue devuelto por una búsqueda de este pedido. Buscalo primero.".into());}
                let candidates=if name=="open_application" {self.apps.as_deref().unwrap_or(&[])} else {&self.folders};
                let candidate=candidates.iter().find(|a|a.id==id).ok_or("Ese destino no fue encontrado en este pedido. Buscalo primero.")?;
                let state=app.state::<Autonomy>();let mut data=state.0.lock().map_err(|_|"Hay una acción en curso.")?;
                if cancel.load(Ordering::Relaxed){return Err("Consulta cancelada.".into());}
                let proposal=data.propose(if name=="open_folder"{"folder"}else{"application"}.into(),candidate.name.clone(),candidate.label.clone(),candidate.destination.clone(),Instant::now())?;self.proposed=true;
                Ok(json!({"status":"confirmation_required","proposal":proposal,"message":"Todavía no se abrió. El usuario debe confirmar el destino en la interfaz."}))
            },
            _=>Err("El modelo solicitó una herramienta no permitida.".into())
        }
    }
}
#[tauri::command] pub fn autonomy_cancel(id:u64,state:State<'_,Autonomy>)->Result<(),String>{state.0.lock().map_err(|_|"Hay una acción en curso.")?.cancel(id);Ok(())}
#[tauri::command] pub fn autonomy_confirm(id:u64,app:AppHandle,state:State<'_,Autonomy>)->Result<String,String>{
    let pending=state.0.lock().map_err(|_|"Hay una acción en curso.")?.take(id,Instant::now())?;
    match pending.destination {
        Destination::Registered(entry)=>crate::applications::launch(&app,&entry)?,
        Destination::Installed(id)=>{
            if !valid_app_id(&id){return Err("La aplicación dejó de estar disponible.".into());}
            #[cfg(windows)] {let root=std::env::var_os("SystemRoot").map(PathBuf::from).ok_or("No se encontró Windows.")?;std::process::Command::new(root.join("explorer.exe")).arg(format!("shell:AppsFolder\\{id}")).spawn().map_err(|_|"Windows no pudo solicitar la apertura de la aplicación.")?;}
            #[cfg(not(windows))] return Err("Esta apertura requiere Windows.".into());
        },
        Destination::Folder(path)=>{let path=crate::assistant::local_folder(&path)?;app.opener().open_path(path.to_string_lossy().into_owned(),None::<&str>).map_err(|_|"Windows no pudo abrir la carpeta.")?;}
    }
    Ok(format!("Se solicitó a Windows abrir {}.",pending.proposal.name))
}
