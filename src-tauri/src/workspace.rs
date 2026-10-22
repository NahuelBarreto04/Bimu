use serde::{Deserialize,Serialize};
use serde_json::{json,Value};
use std::{fs,io::Read,path::{Component,Path,PathBuf},sync::{Arc,Mutex}};
use tauri::{AppHandle,State,Manager};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
pub struct Grant { pub root:Option<PathBuf>,pub generation:u64 }
#[derive(Clone,Default)]
pub struct Workspace(pub Arc<Mutex<Grant>>);
#[derive(Serialize)]
pub struct FolderInfo { pub name:String }
#[tauri::command]
pub async fn workspace_choose(app:AppHandle,state:State<'_,Workspace>)->Result<Option<FolderInfo>,String>{
    let selected=tauri::async_runtime::spawn_blocking(move||{
        let dialog=app.dialog().file().set_title("Compartir una carpeta con Bimu · solo lectura");
        let dialog=if let Some(window)=app.get_webview_window("main"){dialog.set_parent(&window)}else{dialog};
        dialog.blocking_pick_folder()
    }).await.map_err(|_|"No se pudo abrir el selector de carpeta.")?;
    let Some(selected)=selected else{return Ok(None)};
    let root=selected.into_path().map_err(|_|"La carpeta no tiene una ruta local válida.")?.canonicalize().map_err(|_|"No se pudo acceder a la carpeta.")?;
    if !root.is_dir(){return Err("Elegí una carpeta.".into());}
    let name=root.file_name().unwrap_or(root.as_os_str()).to_string_lossy().into_owned();
    let mut grant=state.inner().0.lock().map_err(|_|"No se pudo compartir la carpeta.")?;
    grant.generation=grant.generation.wrapping_add(1);grant.root=Some(root);
    Ok(Some(FolderInfo{name}))
}
#[tauri::command]
pub fn workspace_revoke(state:State<'_,Workspace>)->Result<(),String>{
    let mut grant=state.inner().0.lock().map_err(|_|"No se pudo quitar la carpeta.")?;
    grant.root=None;grant.generation=grant.generation.wrapping_add(1);Ok(())
}
pub fn snapshot(workspace:&Workspace)->Result<(PathBuf,u64),String>{
    let grant=workspace.0.lock().map_err(|_|"No se pudo validar la carpeta.")?;
    Ok((grant.root.clone().ok_or("No hay carpeta compartida.")?,grant.generation))
}
pub fn check(workspace:&Workspace,generation:u64)->Result<(),String>{
    let grant=workspace.0.lock().map_err(|_|"No se pudo validar la carpeta.")?;
    if grant.root.is_none()||grant.generation!=generation{return Err("El acceso a la carpeta cambió o fue revocado.".into());}Ok(())
}
fn blocked(name:&str)->bool{
    let n=name.to_ascii_lowercase();
    n.starts_with('.')||matches!(n.as_str(),"node_modules"|"target"|"dist"|"build"|"vendor"|"coverage"|"secrets"|"credentials"|"id_rsa"|"id_ed25519")||[".pem",".key",".p12",".pfx",".keystore"].iter().any(|ext|n.ends_with(ext))
}
fn safe_path(root:&Path,relative:&str)->Result<PathBuf,String>{
    if relative.len()>1024||relative.contains(':')||relative.contains('\\')||relative.contains('\0'){return Err("La ruta debe ser relativa y usar / como separador.".into());}
    let path=Path::new(relative);
    if path.is_absolute(){return Err("No se permiten rutas absolutas.".into());}
    let mut current=root.to_path_buf();
    for part in path.components(){match part {
        Component::CurDir=>{},
        Component::Normal(name)=>{
            let name=name.to_str().ok_or("El nombre no es UTF-8.")?;
            if blocked(name){return Err("Ruta excluida del acceso de Bimu.".into());}
            current.push(name);
            let meta=fs::symlink_metadata(&current).map_err(|_|"La ruta no existe o no es accesible.")?;
            if meta.file_type().is_symlink(){return Err("No se siguen enlaces simbólicos.".into());}
        },
        _=>return Err("La ruta no puede salir de la carpeta compartida.".into())
    }}
    let resolved=current.canonicalize().map_err(|_|"No se pudo resolver la ruta.")?;
    if !resolved.starts_with(root){return Err("La ruta está fuera de la carpeta compartida.".into());}
    if resolved.strip_prefix(root).map_err(|_|"Ruta inválida.")?.components().any(|part|matches!(part,Component::Normal(name) if blocked(&name.to_string_lossy()))){return Err("Ruta excluida del acceso de Bimu.".into());}
    Ok(resolved)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PathArgs {path:String}
pub fn arguments(value:Value)->Result<String,String>{
    let args:PathArgs=serde_json::from_value(value).map_err(|_|"Se requiere únicamente el parámetro path, de tipo texto.".to_string())?;
    if args.path.len()>1024{return Err("La ruta es demasiado larga.".into());}
    Ok(args.path)
}
pub fn execute(root:&Path,name:&str,relative:&str)->Result<Value,String>{
    let path=safe_path(root,relative)?;
    match name {
        "list_files"=>{
            if !path.is_dir(){return Err("La ruta no es una carpeta.".into());}
            let mut entries=Vec::new();let mut truncated=false;
            for (scanned,entry) in fs::read_dir(&path).map_err(|_|"No se pudo listar la carpeta.")?.take(2001).enumerate(){
                if scanned==2000{truncated=true;break}
                let Ok(entry)=entry else{continue};let name=entry.file_name().to_string_lossy().into_owned();if blocked(&name){continue}
                let Ok(kind)=entry.file_type()else{continue};if kind.is_symlink(){continue}
                let Ok(resolved)=entry.path().canonicalize()else{continue};if !resolved.starts_with(root){continue}
                if entries.len()>=120{truncated=true;break}
                let rel=entry.path().strip_prefix(root).map_err(|_|"Ruta inválida.")?.to_string_lossy().replace('\\',"/");
                entries.push(json!({"path":rel,"kind":if kind.is_dir(){"directory"}else{"file"}}));
            }
            entries.sort_by_key(|v|v["path"].as_str().unwrap_or("").to_owned());
            Ok(json!({"entries":entries,"truncated":truncated,"note":"Listado de un nivel. Se omiten archivos ocultos, dependencias y rutas sensibles conocidas."}))
        },
        "read_file"=>{
            let file=fs::File::open(&path).map_err(|_|"No se pudo abrir el archivo.")?;
            let meta=file.metadata().map_err(|_|"No se pudo consultar el archivo.")?;
            if !meta.is_file(){return Err("La ruta no es un archivo regular.".into());}
            if meta.len()>65536{return Err("El archivo supera el límite de 64 KiB.".into());}
            let mut bytes=Vec::new();file.take(65537).read_to_end(&mut bytes).map_err(|_|"No se pudo leer el archivo.")?;
            if bytes.len()>65536||bytes.contains(&0){return Err("El archivo es demasiado grande o es binario.".into());}
            let content=String::from_utf8(bytes).map_err(|_|"Solo se admiten archivos de texto UTF-8.".to_string())?;
            Ok(json!({"path":relative,"content":content}))
        },
        _=>Err("Herramienta no permitida.".into())
    }
}
pub fn definitions()->Value{json!([
    {"type":"function","function":{"name":"list_files","description":"Listar un nivel de una carpeta compartida. Usar path . para la raíz y / para subcarpetas.","parameters":{"type":"object","properties":{"path":{"type":"string"}},"required":["path"],"additionalProperties":false}}},
    {"type":"function","function":{"name":"read_file","description":"Leer un archivo UTF-8 de hasta 64 KiB, exclusivamente dentro de la carpeta compartida. Usar rutas relativas con /.","parameters":{"type":"object","properties":{"path":{"type":"string"}},"required":["path"],"additionalProperties":false}}}
])}
#[cfg(test)] mod tests{
    use super::*;
    #[test]fn rejects_escape_and_secrets(){let root=std::env::temp_dir();for p in ["../outside","/etc/passwd","C:/Windows",".env","node_modules/x","secret.key","a\\b"]{assert!(safe_path(&root,p).is_err(),"{p}");}}
    #[test]fn validates_args(){assert!(arguments(json!({"path":"a","extra":true})).is_err());assert!(arguments(json!({"path":2})).is_err());assert_eq!(arguments(json!({"path":"."})).unwrap(),".");}
    #[test]fn reads_only_small_text(){let root=std::env::temp_dir().join(format!("bimu-test-{}",std::process::id()));fs::create_dir_all(&root).unwrap();let root=root.canonicalize().unwrap();fs::write(root.join("hello.txt"),"hola").unwrap();fs::write(root.join("binary.bin"),[0,1,2]).unwrap();fs::write(root.join("large.txt"),vec![b'x';65537]).unwrap();assert_eq!(execute(&root,"read_file","hello.txt").unwrap()["content"],"hola");assert!(execute(&root,"read_file","binary.bin").is_err());assert!(execute(&root,"read_file","large.txt").is_err());assert!(execute(&root,"run_command","hello.txt").is_err());fs::remove_dir_all(root).unwrap();}
}
