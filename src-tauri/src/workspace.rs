use serde::Serialize;
use serde_json::json;
use std::{fs,path::PathBuf,sync::Mutex};
use tauri::{AppHandle,State,Manager};
use tauri_plugin_dialog::DialogExt;
pub use crate::workspace_core::{Workspace,FolderInfo,SharedDocument,FileInfo,execute,execute_scope,snapshot,check,arguments,definitions};
use crate::workspace_core::{info,install_files,prepare_files};
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
    grant.generation=grant.generation.wrapping_add(1);grant.root=Some(root);grant.files.clear();
    Ok(Some(info(&grant)))
}
#[tauri::command]
pub fn workspace_revoke(state:State<'_,Workspace>)->Result<(),String>{
    let mut grant=state.inner().0.lock().map_err(|_|"No se pudo quitar la carpeta.")?;
    grant.root=None;grant.files.clear();grant.generation=grant.generation.wrapping_add(1);Ok(())
}
#[tauri::command]
pub async fn workspace_choose_files(app:AppHandle,state:State<'_,Workspace>)->Result<Option<FolderInfo>,String>{
    let selected=tauri::async_runtime::spawn_blocking(move||{let picker=app.dialog().file().set_title("Compartir hasta 10 archivos · solo lectura").add_filter("Documentos y texto",&["txt","pdf","docx","xls","xlsx","ods","csv","tsv","md","json","log","yaml","yml","xml","html","js","ts","tsx","jsx","css","rs","py"]);let picker=if let Some(w)=app.get_webview_window("main"){picker.set_parent(&w)}else{picker};picker.blocking_pick_files()}).await.map_err(|_|"No se pudo abrir el selector.")?;
    let Some(selected)=selected else{return Ok(None)};
    let paths=selected.into_iter().map(|p|p.into_path().map_err(|_|"Ruta de archivo inválida.".to_string())).collect::<Result<Vec<_>,_>>()?;
    let (docs,items)=tauri::async_runtime::spawn_blocking(move||prepare_files(paths)).await.map_err(|_|"No se pudieron preparar los archivos.")??;
    if docs.is_empty(){return Err(items.iter().map(|i|format!("{}: {}",i.name,i.detail)).collect::<Vec<_>>().join(" · "));}
    let mut grant=state.inner().0.lock().map_err(|_|"No se pudo compartir el lote.")?;install_files(&mut grant,docs)?;let mut result=info(&grant);result.issues=items.into_iter().filter(|i|i.status=="error").collect();Ok(Some(result))
}
#[tauri::command]
pub fn workspace_remove_file(id:String,state:State<'_,Workspace>)->Result<Option<FolderInfo>,String>{
    let mut grant=state.inner().0.lock().map_err(|_|"No se pudo quitar el archivo.")?;if grant.root.is_some(){return Err("El acceso actual es una carpeta.".into());}
    grant.files.retain(|d|d.id!=id);grant.generation=grant.generation.wrapping_add(1);Ok(if grant.files.is_empty(){None}else{Some(info(&grant))})
}
#[derive(Clone)]pub enum Prepared{Folder(PathBuf),Files(Vec<SharedDocument>)}
#[derive(Default)]pub struct DropState{ticket:u64,paths:Vec<PathBuf>,prepared:Option<Prepared>,items:Vec<FileInfo>}
#[derive(Default)]pub struct DropInbox(pub Mutex<DropState>);
#[derive(Serialize)]pub struct DropPreview{id:u64,name:String,entries:usize,truncated:bool,kind:String,items:Vec<FileInfo>,ready:usize}
pub fn handle_drag(window:&tauri::Window,event:&tauri::DragDropEvent){
    use tauri::Emitter;
    let data=match event{
        tauri::DragDropEvent::Enter{..}=>json!({"kind":"enter"}),tauri::DragDropEvent::Over{..}=>json!({"kind":"over"}),tauri::DragDropEvent::Leave=>json!({"kind":"leave"}),
        tauri::DragDropEvent::Drop{paths,..}=>{let inbox=window.state::<DropInbox>();let Ok(mut p)=inbox.inner().0.lock()else{return};p.ticket=p.ticket.wrapping_add(1);p.prepared=None;p.items.clear();p.paths=paths.iter().take(11).cloned().collect();json!({"kind":"drop","id":p.ticket})},_=>return
    };let _=window.emit("bimu-folder-drag",data);
}
#[tauri::command]
pub async fn workspace_stage_drop(id:u64,inbox:State<'_,DropInbox>)->Result<DropPreview,String>{
    let paths={let p=inbox.inner().0.lock().map_err(|_|"No se pudo preparar el contenido.")?;if p.ticket!=id{return Err("El arrastre cambió.".into());}p.paths.clone()};
    let (prepared,name,entries,truncated,items,ready)=tauri::async_runtime::spawn_blocking(move||->Result<_,String>{
        if paths.len()==1&&paths[0].is_dir(){let root=paths[0].canonicalize().map_err(|_|"No se pudo acceder a la carpeta.")?;let listing=execute(&root,"list_files",".")?;let name=root.file_name().unwrap_or(root.as_os_str()).to_string_lossy().into_owned();let entries=listing["entries"].as_array().map(Vec::len).unwrap_or(0);return Ok((Prepared::Folder(root),name,entries,listing["truncated"].as_bool().unwrap_or(false),vec![],1));}
        let (docs,items)=prepare_files(paths)?;let ready=docs.len();let name=if items.len()==1{items[0].name.clone()}else{format!("{} archivos",items.len())};Ok((Prepared::Files(docs),name,items.len(),false,items,ready))
    }).await.map_err(|_|"No se pudo preparar el contenido.")??;
    let kind=if matches!(&prepared,Prepared::Folder(_)){"folder"}else{"files"}.to_string();
    let mut p=inbox.inner().0.lock().map_err(|_|"No se pudo preparar el contenido.")?;if p.ticket!=id{return Err("El arrastre cambió.".into());}p.prepared=Some(prepared);p.items=items.clone();Ok(DropPreview{id,name,entries,truncated,kind,items,ready})
}
#[tauri::command]
pub fn workspace_accept_drop(id:u64,inbox:State<'_,DropInbox>,workspace:State<'_,Workspace>)->Result<FolderInfo,String>{
    let mut p=inbox.inner().0.lock().map_err(|_|"No se pudo recibir el contenido.")?;if p.ticket!=id{return Err("El contenido ya no está disponible.".into());}let prepared=p.prepared.as_ref().ok_or("Esperá a que termine la preparación.")?.clone();
    let mut grant=workspace.inner().0.lock().map_err(|_|"No se pudo compartir el contenido.")?;
    match prepared{Prepared::Folder(root)=>{if !root.is_dir(){return Err("La carpeta ya no está disponible.".into());}grant.root=Some(root);grant.files.clear();grant.generation=grant.generation.wrapping_add(1);},Prepared::Files(docs)=>{if docs.is_empty(){return Err("No se pudo leer ningún archivo del lote.".into());}install_files(&mut grant,docs)?;}}
    let mut result=info(&grant);result.issues=p.items.iter().filter(|i|i.status=="error").cloned().collect();p.prepared=None;p.paths.clear();p.items.clear();Ok(result)
}
#[tauri::command]
pub fn workspace_discard_drop(id:u64,inbox:State<'_,DropInbox>)->Result<(),String>{let mut p=inbox.inner().0.lock().map_err(|_|"No se pudo descartar el contenido.")?;if p.ticket==id{p.prepared=None;p.paths.clear();p.items.clear();p.ticket=p.ticket.wrapping_add(1);}Ok(())}
