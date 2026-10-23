use std::{path::PathBuf, sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}}, time::{Duration, Instant}};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_opener::OpenerExt;
use crate::{autonomy_core::*, application_registry::{Entry, available}};

#[derive(Clone)] enum Destination { Registered(Entry), Installed(String), Folder(PathBuf), File(PathBuf) }
#[derive(Clone)] struct Candidate { id: String, name: String, label: String, destination: Destination, aliases: Vec<String>, approximate:bool }
struct Conversation { id:String, model:String, used:Instant, session:Arc<Mutex<Session>> }
#[derive(Default)] pub struct Autonomy(Mutex<Confirmations<Destination>>,Mutex<Option<Conversation>>);
#[derive(Default)] pub struct Session {
    apps:Option<Vec<Candidate>>, revealed_apps:std::collections::HashSet<String>,
    folders:Vec<Candidate>, files:Vec<Candidate>, choices:Choices, sequence:u64,
    request:String, acted:bool,
}
pub fn conversation(app:&AppHandle,id:&str,model:&str)->Result<Arc<Mutex<Session>>,String>{
    let state=app.state::<Autonomy>();let mut current=state.1.lock().map_err(|_|"Conversación ocupada.")?;
    let reset=current.as_ref().is_none_or(|c|c.id!=id||c.model!=model||c.used.elapsed()>Duration::from_secs(300));
    if reset{*current=Some(Conversation{id:id.into(),model:model.into(),used:Instant::now(),session:Arc::new(Mutex::new(Session::default()))});}
    let current=current.as_mut().unwrap();current.used=Instant::now();Ok(current.session.clone())
}
fn launch(app:&AppHandle,destination:Destination)->Result<(),String>{
    match destination {
        Destination::Registered(entry)=>crate::applications::launch(app,&entry),
        Destination::Installed(id)=>{
            if !valid_app_id(&id){return Err("La aplicación dejó de estar disponible.".into());}
            #[cfg(windows)] {let root=std::env::var_os("SystemRoot").map(PathBuf::from).ok_or("No se encontró Windows.")?;std::process::Command::new(root.join("explorer.exe")).arg(format!("shell:AppsFolder\\{id}")).spawn().map(|_|()).map_err(|_|"Windows no pudo solicitar la apertura de la aplicación.".into())}
            #[cfg(not(windows))] {Err("Esta apertura requiere Windows.".into())}
        },
        Destination::Folder(path)=>{let path=crate::assistant::local_folder(&path)?;app.opener().open_path(path.to_string_lossy().into_owned(),None::<&str>).map_err(|_|"Windows no pudo abrir la carpeta.".into())},
        Destination::File(path)=>{let path=crate::file_search::openable_file(&path)?;app.opener().open_path(path.to_string_lossy().into_owned(),None::<&str>).map_err(|_|"Windows no pudo abrir el archivo con su aplicación predeterminada.".into())}
    }
}


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
    fn choice(candidate:&Candidate,kind:&str)->Choice{Choice{id:candidate.id.clone(),name:candidate.name.clone(),target:candidate.label.clone(),kind:kind.into()}}
    fn candidate(&self,kind:&str,id:&str)->Option<Candidate>{
        let items=match kind{"application"=>self.apps.as_deref().unwrap_or(&[]),"folder"=>&self.folders,"file"=>&self.files,_=>return None};
        items.iter().find(|c|c.id==id).cloned()
    }
    pub fn context(&self)->Value{json!({"choices":self.choices.current(Instant::now()),"note":"Resultados reales de esta conversación. No prueban una apertura. Si el usuario está eligiendo, usá el id existente; no vuelvas al registro manual de apps."})}
    pub fn begin_turn(&mut self,app:&AppHandle,text:&str,cancel:&Arc<AtomicBool>)->Result<Option<Value>,String>{
        self.acted=false;
        let selected=self.choices.resolve(text,Instant::now());
        self.request=text.into();
        if let Some(choice)=selected {
            let candidate=self.candidate(&choice.kind,&choice.id).ok_or("Los resultados cambiaron. Volvé a buscar.")?;
            return self.open(app,candidate,&choice.kind,choice.kind=="application",cancel).map(Some);
        }
        if self.choices.pending(Instant::now())&&(selection_reply(text)||self.choices.named_reply(text,Instant::now())){
            let options=self.choices.current(Instant::now()).iter().enumerate().map(|(i,c)|format!("{}. {} — {}",i+1,c.name,c.target)).collect::<Vec<_>>().join("\n");
            return Ok(Some(json!({"status":"choose","message":format!("La elección no identifica un único resultado. Elegí el número de una de estas opciones:\n\n{}",options)})));
        }
        if selection_reply(text){self.choices.disarm();return Ok(Some(json!({"status":"selection_missing","message":"No tengo una lista de resultados vigente para esa elección. Repetí el pedido completo, por ejemplo: abrí Discord. No se abrió ninguna aplicación."})));}
        // Keep the data for interpretation, but only the immediate explicit choice can open directly.
        self.choices.disarm();
        Ok(None)
    }
    pub fn direct(&mut self,app:&AppHandle,plan:&DirectRequest,cancel:&Arc<AtomicBool>)->Result<Value,String>{
        let result=resolve_direct(plan,|tool,args|self.execute(app,tool,args,cancel));
        if cancel.load(Ordering::Relaxed){self.choices.clear();return Err("Consulta cancelada.".into());}
        result
    }
    fn open(&mut self,app:&AppHandle,candidate:Candidate,kind:&str,direct:bool,cancel:&Arc<AtomicBool>)->Result<Value,String>{
        if self.acted{return Err("Ya se procesó una apertura en este pedido.".into());}
        if cancel.load(Ordering::Relaxed){return Err("Consulta cancelada.".into());}
        self.acted=true;self.choices.clear();let approximate=candidate.approximate;
        if direct&&kind=="application"{
            launch(app,candidate.destination)?;
            return Ok(json!({"status":"opened","name":candidate.name,"target":candidate.label,"message":format!("Se solicitó a Windows abrir {}.",candidate.name)}));
        }
        let state=app.state::<Autonomy>();let proposal=state.0.lock().map_err(|_|"Hay una acción en curso.")?.propose(kind.into(),candidate.name,candidate.label,candidate.destination,Instant::now())?;
        Ok(json!({"status":"confirmation_required","approximate":approximate,"proposal":proposal,"message":"Todavía no se abrió. Confirmá el destino en la interfaz."}))
    }
    fn choice_result(&mut self,kind:&str,candidates:&[Candidate],opening:bool,incomplete:bool)->Value{
        self.choices.set(candidates.iter().map(|c|Self::choice(c,kind)).collect(),opening,Instant::now());
        let choices=self.choices.current(Instant::now());
        let matches:Vec<_>=choices.iter().map(|c|json!({"id":c.id,"name":c.name,"target":c.target})).collect();
        let mut result=json!({"matches":matches,"incomplete":incomplete});
        if opening&&!choices.is_empty(){
            if choices.len()==1&&kind!="application"{result["status"]=json!("ready_to_open");result["id"]=json!(choices[0].id);result["kind"]=json!(kind);}
            else{
                let options=choices.iter().enumerate().map(|(i,c)|format!("{}. {} — {}",i+1,c.name,c.target)).collect::<Vec<_>>().join("\n");
                result["status"]=json!("choose");result["message"]=json!(format!("Encontré estas opciones:\n\n{}\n\nDecime el nombre o el número de la opción que querés abrir.{}",options,if incomplete{" La búsqueda es parcial; puede haber más resultados."}else{""}));
            }
        }
        result
    }
    pub fn execute(&mut self,app:&AppHandle,name:&str,args:Value,cancel:&Arc<AtomicBool>)->Result<Value,String>{
        if cancel.load(Ordering::Relaxed){return Err("Consulta cancelada.".into());}
        let args=arguments(args)?;
        let opening=crate::application_intent::requested(&self.request).is_some();
        match name {
            "get_current_time"=>time_at(&query(&args,"timezone")?,chrono::Utc::now()),
            "search_applications"=>{
                let q=query(&args,"query")?;
                if self.apps.is_none(){
                    let mut apps:Vec<_>=crate::applications::configured(app)?.into_iter().filter(available).map(|entry|Candidate{id:String::new(),name:entry.name.clone(),label:crate::application_registry::view(&entry).target,aliases:entry.aliases.clone(),approximate:false,destination:Destination::Registered(entry)}).collect();
                    for entry in windows_apps(cancel)?{
                        if apps.iter().any(|a|crate::application_intent::normalized(&a.name)==crate::application_intent::normalized(&entry.name)){continue;}
                        apps.push(Candidate{id:String::new(),name:entry.name,label:format!("Aplicación de Windows · {}",entry.app_id),approximate:false,aliases:vec![],destination:Destination::Installed(entry.app_id)});
                    }
                    for(i,a)in apps.iter_mut().enumerate(){a.id=format!("app-{i}");}self.apps=Some(apps);
                }
                let apps=self.apps.as_ref().unwrap();
                let exact=unique_exact_app(&self.request,&apps.iter().map(|a|std::iter::once(a.name.clone()).chain(a.aliases.clone()).collect()).collect::<Vec<_>>());
                let mut found:Vec<_>=apps.iter().filter_map(|a|{let rank=std::iter::once(&a.name).chain(&a.aliases).map(|n|score(n,&q)).max().unwrap_or(0);(rank>0).then_some((rank,a.clone()))}).collect();
                found.sort_by(|a,b|b.0.cmp(&a.0).then(a.1.name.cmp(&b.1.name)));
                let total=found.len();let found:Vec<_>=found.into_iter().take(12).map(|(_,a)|a).collect();
                for a in &found{self.revealed_apps.insert(a.id.clone());}
                let direct=exact.and_then(|i|apps.get(i)).filter(|a|found.iter().any(|f|f.id==a.id)).map(|a|a.id.clone());
                let mut result=self.choice_result("application",&found,opening,total>12);
                if let Some(id)=direct{result["status"]=json!("ready_to_open");result["kind"]=json!("application");result["id"]=json!(id);}
                result["query"]=json!(q);result["total"]=json!(total);Ok(result)
            },
            "search_folders"=>{
                let q=query(&args,"query")?;let result=crate::assistant_core::search_folders(crate::assistant::roots(),&q,cancel,Duration::from_secs(15),300000);
                if result.cancelled{return Err("Búsqueda cancelada.".into());}
                self.sequence+=1;
                let total=result.matches.len();self.folders=result.matches.into_iter().take(12).enumerate().map(|(i,f)|Candidate{id:format!("folder-{}-{i}",self.sequence),name:f.name,label:f.path.display().to_string(),destination:Destination::Folder(f.path),aliases:vec![],approximate:false}).collect();
                let mut response=self.choice_result("folder",&self.folders.clone(),opening,result.incomplete||total>12);response["query"]=json!(q);response["total"]=json!(total);response["skipped"]=json!(result.skipped);response["visited"]=json!(result.visited);Ok(response)
            },
            "search_files"=>{
                let q=query(&args,"query")?;let ext=args.get("extension").filter(|v|!v.is_null()).map(|v|v.as_str().ok_or("La extensión debe ser texto.")).transpose()?;
                let result=crate::file_search::search_files(crate::assistant::roots(),&q,ext,cancel,Duration::from_secs(15),300000)?;
                if result.cancelled{return Err("Búsqueda cancelada.".into());}
                self.sequence+=1;
                let total=result.matches.len();self.files=result.matches.into_iter().take(12).enumerate().map(|(i,f)|Candidate{id:format!("file-{}-{i}",self.sequence),approximate:crate::file_search::filename_quality(&f.name,&q)==1,name:f.name,label:f.path.display().to_string(),destination:Destination::File(f.path),aliases:vec![]}).collect();
                let mut response=self.choice_result("file",&self.files.clone(),opening,result.incomplete||total>12);response["query"]=json!(q);response["total"]=json!(total);response["skipped"]=json!(result.skipped);response["visited"]=json!(result.visited);response["note"]=json!("Solo se buscaron nombres. Abrir no comparte el archivo con el modelo ni lee su contenido.");Ok(response)
            },
            "open_application"|"open_folder"|"open_file"=>{
                let id=query(&args,"id")?;let kind=match name{"open_application"=>"application","open_folder"=>"folder",_=>"file"};
                if kind=="application"&&!self.revealed_apps.contains(&id){return Err("Esa aplicación no fue encontrada en esta conversación. Buscala primero.".into());}
                let candidate=self.candidate(kind,&id).ok_or("El destino no está entre los resultados vigentes. Buscalo primero.")?;
                let direct=kind=="application"&&self.apps.as_ref().and_then(|apps|unique_exact_app(&self.request,&apps.iter().map(|a|std::iter::once(a.name.clone()).chain(a.aliases.clone()).collect()).collect::<Vec<_>>()).map(|index|apps[index].id==id)).unwrap_or(false);
                self.open(app,candidate,kind,direct,cancel)
            },
            _=>Err("El modelo solicitó una herramienta no permitida.".into())
        }
    }
}
#[tauri::command] pub fn autonomy_cancel(id:u64,state:State<'_,Autonomy>)->Result<(),String>{state.0.lock().map_err(|_|"Hay una acción en curso.")?.cancel(id);Ok(())}
#[tauri::command]pub fn autonomy_reset(conversation_id:String,state:State<'_,Autonomy>)->Result<(),String>{let mut current=state.1.lock().map_err(|_|"Conversación ocupada.")?;if current.as_ref().is_some_and(|c|c.id==conversation_id){*current=None;}Ok(())}
#[tauri::command] pub fn autonomy_confirm(id:u64,app:AppHandle,state:State<'_,Autonomy>)->Result<String,String>{
    let pending=state.0.lock().map_err(|_|"Hay una acción en curso.")?.take(id,Instant::now())?;
    launch(&app,pending.destination)?;
    Ok(format!("Se solicitó a Windows abrir {}.",pending.proposal.name))
}
