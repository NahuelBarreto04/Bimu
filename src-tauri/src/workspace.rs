use std::{path::PathBuf,sync::Mutex};
use serde_json::json;
use tauri::{AppHandle,Manager,State};

#[derive(Default)]pub struct DropState{ticket:u64,paths:Vec<PathBuf>}
#[derive(Default)]pub struct DropInbox(pub Mutex<DropState>);

#[tauri::command]
pub fn shelf_accept_drop(id:u64,app:AppHandle,inbox:State<'_,DropInbox>)->Result<Vec<crate::shelf::ShelfItem>,String>{
    let mut drop=inbox.inner().0.lock().map_err(|_|"No se pudo recibir el arrastre.")?;
    if drop.ticket!=id{return Err("El arrastre ya no está disponible.".into())}
    let result=crate::shelf::add_paths(&app,drop.paths.clone())?;
    drop.paths.clear();drop.ticket=drop.ticket.wrapping_add(1);Ok(result)
}
#[tauri::command]
pub fn workspace_discard_drop(id:u64,inbox:State<'_,DropInbox>)->Result<(),String>{
    let mut drop=inbox.inner().0.lock().map_err(|_|"No se pudo descartar el contenido.")?;
    if drop.ticket==id{drop.paths.clear();drop.ticket=drop.ticket.wrapping_add(1)}Ok(())
}
pub fn handle_drag(window:&tauri::Window,event:&tauri::DragDropEvent){
    use tauri::Emitter;
    let data=match event{
        tauri::DragDropEvent::Enter{..}=>json!({"kind":"enter"}),
        tauri::DragDropEvent::Over{..}=>json!({"kind":"over"}),
        tauri::DragDropEvent::Leave=>json!({"kind":"leave"}),
        tauri::DragDropEvent::Drop{paths,..}=>{let inbox=window.state::<DropInbox>();let Ok(mut p)=inbox.inner().0.lock()else{return};p.ticket=p.ticket.wrapping_add(1);p.paths=paths.iter().take(11).cloned().collect();json!({"kind":"drop","id":p.ticket})},_=>return
    };let _=window.emit("bimu-folder-drag",data);
}
