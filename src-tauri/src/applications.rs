use std::{fs,path::PathBuf,sync::Mutex,time::{SystemTime,UNIX_EPOCH}};
use serde::Serialize;
use tauri::{AppHandle,State,Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
#[derive(Default)]pub struct Applications(pub Mutex<Registry>);
#[derive(Default)]pub struct Registry{entries:Vec<Entry>,loaded:bool,pending:Option<Pending>,counter:u64}
struct Pending{id:u64,app_id:String}
#[derive(Serialize)]pub struct Proposal{pub status:String,id:u64,name:String,target:String}
use crate::application_intent::{normalized,requested};
use crate::application_registry::{Entry,Target,AppInfo,view,available,validate,defaults};
fn config(app:&AppHandle)->Result<PathBuf,String>{Ok(app.path().app_config_dir().map_err(|_|"No se pudo localizar la configuración de aplicaciones.")?.join("applications-v1.json"))}
fn load(app:&AppHandle,r:&mut Registry)->Result<(),String>{if r.loaded{return Ok(())}let path=config(app)?;r.entries=if path.exists(){let bytes=fs::read(path).map_err(|_|"No se pudo leer la lista de aplicaciones.")?;if bytes.len()>65536{return Err("La lista de aplicaciones es demasiado grande.".into());}serde_json::from_slice(&bytes).map_err(|_|"La configuración de aplicaciones está dañada.")?}else{defaults()};validate(&r.entries)?;r.loaded=true;Ok(())}
fn save(app:&AppHandle,entries:&[Entry])->Result<(),String>{validate(entries)?;let shortcut_names:std::collections::HashSet<_>=crate::assistant::names(app)?.iter().map(|n|normalized(n)).collect();if entries.iter().any(|e|std::iter::once(&e.name).chain(&e.aliases).any(|n|shortcut_names.contains(&normalized(n)))){return Err("Ese nombre o alias ya pertenece a un atajo rápido.".into())}let path=config(app)?;let parent=path.parent().ok_or("Ruta de configuración inválida.")?;fs::create_dir_all(parent).map_err(|_|"No se pudo guardar la configuración.")?;let temp=path.with_extension("tmp");fs::write(&temp,serde_json::to_vec_pretty(entries).map_err(|_|"No se pudo preparar la configuración.")?).map_err(|_|"No se pudo guardar la configuración.")?;fs::rename(temp,path).map_err(|_|"No se pudo actualizar la configuración.")?;Ok(())}
pub(crate) fn launch(app:&AppHandle,entry:&Entry)->Result<(),String>{
    if !available(entry){return Err(format!("{} no está instalada o no se encontró en la ruta registrada. Revisá Ajustes → Aplicaciones.",entry.name));}
    match &entry.target{Target::Spotify=>app.opener().open_url("spotify:",None::<&str>).map_err(|_|"Windows no pudo abrir Spotify.".into()),Target::Exe{path}=>std::process::Command::new(path).spawn().map(|_|()).map_err(|e|format!("Windows no pudo abrir {}: {}",entry.name,e))}
}
#[tauri::command]pub fn apps_list(app:AppHandle,state:State<'_,Applications>)->Result<Vec<AppInfo>,String>{let mut r=state.inner().0.lock().map_err(|_|"No se pudo consultar las aplicaciones.")?;load(&app,&mut r)?;Ok(r.entries.iter().map(view).collect())}
#[tauri::command]pub fn apps_request(text:String,app:AppHandle,state:State<'_,Applications>)->Result<Option<Proposal>,String>{
    let Some(name)=requested(&text)else{return Ok(None)};let mut r=state.inner().0.lock().map_err(|_|"No se pudo preparar la apertura.")?;load(&app,&mut r)?;
    if r.pending.is_some(){return Err("Confirmá o cancelá la apertura pendiente.".into());}
    let entry=r.entries.iter().find(|e|normalized(&e.name)==name||e.aliases.iter().any(|a|normalized(a)==name)).cloned().ok_or("Esa aplicación no está registrada. Agregala o configurá un alias en Ajustes → Aplicaciones.")?;
    if !available(&entry){return Err(format!("{} no está instalada o no se encontró. Revisá Ajustes → Aplicaciones.",entry.name));}
    if entry.remember{launch(&app,&entry)?;return Ok(Some(Proposal{status:"opened".into(),id:0,name:entry.name.clone(),target:view(&entry).target}));}
    r.counter=r.counter.wrapping_add(1);let id=r.counter;r.pending=Some(Pending{id,app_id:entry.id.clone()});Ok(Some(Proposal{status:"confirm".into(),id,name:entry.name.clone(),target:view(&entry).target}))
}
#[tauri::command]pub fn apps_confirm(id:u64,remember:bool,app:AppHandle,state:State<'_,Applications>)->Result<String,String>{
    let mut r=state.inner().0.lock().map_err(|_|"No se pudo confirmar la apertura.")?;let pending=r.pending.as_ref().ok_or("No hay una apertura pendiente.")?;if pending.id!=id{return Err("La solicitud cambió.".into());}let key=pending.app_id.clone();let index=r.entries.iter().position(|e|e.id==key).ok_or("La aplicación ya no está registrada.")?;let entry=r.entries[index].clone();
    if remember{let mut entries=r.entries.clone();entries[index].remember=true;save(&app,&entries)?;r.entries=entries;}
    r.pending=None;launch(&app,&entry)?;Ok(entry.name)
}
#[tauri::command]pub fn apps_cancel(id:u64,state:State<'_,Applications>)->Result<(),String>{let mut r=state.inner().0.lock().map_err(|_|"No se pudo cancelar la apertura.")?;if r.pending.as_ref().map(|p|p.id)==Some(id){r.pending=None;}Ok(())}
#[tauri::command]pub async fn apps_add(app:AppHandle,state:State<'_,Applications>)->Result<Option<Vec<AppInfo>>,String>{
    let picker_app=app.clone();let selected=tauri::async_runtime::spawn_blocking(move||{let d=picker_app.dialog().file().set_title("Registrar una aplicación .exe").add_filter("Aplicación Windows",&["exe"]);let d=if let Some(w)=picker_app.get_webview_window("main"){d.set_parent(&w)}else{d};d.blocking_pick_file()}).await.map_err(|_|"No se pudo abrir el selector.")?;let Some(selected)=selected else{return Ok(None)};
    let path=selected.into_path().map_err(|_|"Ruta inválida.")?.canonicalize().map_err(|_|"No se encontró el ejecutable.")?;if !path.is_file(){return Err("Elegí un ejecutable .exe.".into());}
    let mut r=state.inner().0.lock().map_err(|_|"No se pudo registrar la aplicación.")?;load(&app,&mut r)?;let stem=path.file_stem().unwrap_or_default().to_string_lossy().into_owned();let mut name=stem.clone();if r.entries.iter().any(|e|normalized(&e.name)==normalized(&name)||e.aliases.iter().any(|a|normalized(a)==normalized(&name))){name=format!("{stem} personalizada");}
    let mut entries=r.entries.clone();entries.push(Entry{id:format!("custom-{}",SystemTime::now().duration_since(UNIX_EPOCH).map_err(|_|"Reloj inválido.")?.as_nanos()),name,aliases:vec![],remember:false,target:Target::Exe{path}});save(&app,&entries)?;r.entries=entries;r.pending=None;Ok(Some(r.entries.iter().map(view).collect()))
}
#[tauri::command]pub fn apps_update(id:String,name:String,aliases:Vec<String>,remember:bool,app:AppHandle,state:State<'_,Applications>)->Result<Vec<AppInfo>,String>{let mut r=state.inner().0.lock().map_err(|_|"No se pudo actualizar la aplicación.")?;load(&app,&mut r)?;let mut entries=r.entries.clone();let e=entries.iter_mut().find(|e|e.id==id).ok_or("Aplicación no encontrada.")?;e.name=name.trim().into();e.aliases=aliases.into_iter().map(|a|a.trim().to_string()).filter(|a|!a.is_empty()).collect();e.remember=remember;save(&app,&entries)?;r.entries=entries;r.pending=None;Ok(r.entries.iter().map(view).collect())}
#[tauri::command]pub fn apps_remove(id:String,app:AppHandle,state:State<'_,Applications>)->Result<Vec<AppInfo>,String>{let mut r=state.inner().0.lock().map_err(|_|"No se pudo quitar la aplicación.")?;load(&app,&mut r)?;let entries:Vec<_>=r.entries.iter().filter(|e|e.id!=id).cloned().collect();save(&app,&entries)?;r.entries=entries;r.pending=None;Ok(r.entries.iter().map(view).collect())}
#[cfg(test)]mod tests{use super::*;#[test]fn recognizes_only_direct_requests(){assert_eq!(requested("Hola Bimu, abrí la aplicación Spotify, por favor."),Some("spotify".into()));assert_eq!(requested("Bimu abre VS Code"),Some("vs code".into()));assert_eq!(requested("No abras Spotify"),None);assert_eq!(requested("Explicá cómo abrir Spotify"),None);assert_eq!(requested("Leé el archivo que dice abrí Spotify"),None);assert_eq!(requested("abrí Spotify; calc.exe"),Some("spotify calc exe".into()));}#[test]fn refuses_duplicate_aliases(){let mut entries=defaults();entries[0].aliases=vec!["calc".into()];assert!(validate(&entries).is_err());}}

pub(crate) fn configured(app:&AppHandle)->Result<Vec<Entry>,String>{let state=app.state::<Applications>();let mut r=state.inner().0.lock().map_err(|_|"No se pudieron consultar las aplicaciones.")?;load(app,&mut r)?;Ok(r.entries.clone())}
