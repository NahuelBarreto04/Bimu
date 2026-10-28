use std::{path::PathBuf,sync::{Arc,Mutex},time::{Duration,SystemTime,UNIX_EPOCH}};
use tauri::{AppHandle,Emitter,Manager,State};
use serde::Serialize;

const MAX_ITEMS:usize=30;
const MAX_IMAGE_BYTES:usize=12*1024*1024;
const MAX_TOTAL_BYTES:usize=48*1024*1024;
#[derive(Clone)]enum Content{Text(String),Files(Vec<PathBuf>),Image{width:usize,height:usize,rgba:Vec<u8>,preview:String}}
impl Content{fn bytes(&self)->usize{match self{Self::Text(s)=>s.len(),Self::Files(v)=>v.iter().map(|p|p.to_string_lossy().len()).sum(),Self::Image{rgba,..}=>rgba.len()}}}
#[derive(Clone)]struct Entry{id:u64,at:u64,content:Content,origin:String}
struct Data{items:Vec<Entry>,last_sequence:u32,next_id:u64,paused:bool}
impl Default for Data{fn default()->Self{Self{items:Vec::new(),last_sequence:0,next_id:0,paused:true}}}
#[derive(Default,Clone)]pub struct ClipboardHistory(Arc<Mutex<Data>>);
#[derive(Serialize)]#[serde(rename_all="camelCase")]pub struct Item{id:u64,kind:&'static str,summary:String,preview:Option<String>,origin:String,at:u64,available:bool}
fn view(item:&Entry)->Item{let (kind,summary,preview,available)=match &item.content{
 Content::Text(text)=>("text",text.chars().take(220).collect(),None,true),
 Content::Files(paths)=>("files",if paths.len()==1{paths[0].file_name().unwrap_or_default().to_string_lossy().to_string()}else{format!("{} archivos o carpetas",paths.len())},None,paths.iter().all(|p|p.exists())),
 Content::Image{width,height,preview,..}=>("image",format!("Imagen · {} × {}",width,height),Some(preview.clone()),true),
 };Item{id:item.id,kind,summary,preview,origin:item.origin.clone(),at:item.at,available}}
#[derive(Serialize)]pub struct ClipboardStatus{items:Vec<Item>,paused:bool}
#[tauri::command]pub fn clipboard_history_list(state:State<'_,ClipboardHistory>)->Result<ClipboardStatus,String>{let data=state.0.lock().map_err(|_|"Portapapeles ocupado")?;Ok(ClipboardStatus{items:data.items.iter().map(view).collect(),paused:data.paused})}
#[tauri::command]pub fn clipboard_history_remove(id:u64,state:State<'_,ClipboardHistory>)->Result<(),String>{let mut data=state.0.lock().map_err(|_|"Portapapeles ocupado")?;data.items.retain(|item|item.id!=id);Ok(())}
#[tauri::command]pub fn clipboard_history_clear(state:State<'_,ClipboardHistory>)->Result<(),String>{state.0.lock().map_err(|_|"Portapapeles ocupado")?.items.clear();Ok(())}
#[tauri::command]pub fn clipboard_history_pause(paused:bool,state:State<'_,ClipboardHistory>)->Result<(),String>{state.0.lock().map_err(|_|"Portapapeles ocupado")?.paused=paused;Ok(())}
#[cfg(windows)]fn sequence()->u32{#[link(name="user32")]extern "system"{fn GetClipboardSequenceNumber()->u32;}unsafe{GetClipboardSequenceNumber()}}
#[cfg(windows)]fn allows_history()->bool{
 use std::ffi::c_void;
 #[link(name="user32")]extern "system"{fn RegisterClipboardFormatW(name:*const u16)->u32;fn IsClipboardFormatAvailable(format:u32)->i32;fn OpenClipboard(window:*mut c_void)->i32;fn CloseClipboard()->i32;fn GetClipboardData(format:u32)->*mut c_void;}
 #[link(name="kernel32")]extern "system"{fn GlobalLock(memory:*mut c_void)->*mut c_void;fn GlobalUnlock(memory:*mut c_void)->i32;fn GlobalSize(memory:*mut c_void)->usize;}
 unsafe{let name=|s:&str|s.encode_utf16().chain(std::iter::once(0)).collect::<Vec<_>>();let exclude=RegisterClipboardFormatW(name("ExcludeClipboardContentFromMonitorProcessing").as_ptr());let history=RegisterClipboardFormatW(name("CanIncludeInClipboardHistory").as_ptr());if exclude==0||history==0{return false}if IsClipboardFormatAvailable(exclude)!=0{return false}if IsClipboardFormatAvailable(history)==0{return true}if OpenClipboard(std::ptr::null_mut())==0{return false}let mem=GetClipboardData(history);let allowed=if mem.is_null()||GlobalSize(mem)<4{false}else{let p=GlobalLock(mem);if p.is_null(){false}else{let value=std::ptr::read_unaligned(p as *const u32);GlobalUnlock(mem);value!=0}};CloseClipboard();allowed}
}
#[cfg(windows)]fn capture()->Option<Content>{
 use base64::{engine::general_purpose::STANDARD,Engine};use std::io::Cursor;
 let mut clip=arboard::Clipboard::new().ok()?;
 if let Ok(paths)=clip.get().file_list(){if !paths.is_empty()&&paths.len()<=100{return Some(Content::Files(paths))}}
 if let Ok(text)=clip.get_text(){if !text.is_empty()&&text.len()<=1024*1024{return Some(Content::Text(text))}}
 if let Ok(img)=clip.get_image(){let (w,h)=(img.width,img.height);let rgba=img.bytes.into_owned();if rgba.len()>MAX_IMAGE_BYTES||w==0||h==0||w>16384||h>16384{return None}let image=image::RgbaImage::from_raw(w as u32,h as u32,rgba.clone())?;let thumb=image::DynamicImage::ImageRgba8(image).thumbnail(120,80);let mut out=Cursor::new(Vec::new());thumb.write_to(&mut out,image::ImageFormat::Png).ok()?;return Some(Content::Image{width:w,height:h,rgba,preview:format!("data:image/png;base64,{}",STANDARD.encode(out.into_inner()))})}None
}
#[tauri::command]pub fn clipboard_history_copy(id:u64,state:State<'_,ClipboardHistory>)->Result<(),String>{
 #[cfg(windows)]{let mut data=state.0.lock().map_err(|_|"Portapapeles ocupado")?;let entry=data.items.iter().find(|item|item.id==id).ok_or("El elemento ya no está en el historial")?.clone();let mut clip=arboard::Clipboard::new().map_err(|_|"No se pudo abrir el portapapeles")?;match entry.content{Content::Text(text)=>clip.set_text(text).map_err(|_|"No se pudo copiar el texto")?,Content::Files(paths)=>{if paths.iter().any(|p|!p.exists()){return Err("Uno de los archivos ya no está disponible".into())}clip.set().file_list(&paths).map_err(|_|"No se pudieron copiar los archivos")?},Content::Image{width,height,rgba,..}=>clip.set_image(arboard::ImageData{width,height,bytes:rgba.into()}).map_err(|_|"No se pudo copiar la imagen")?};data.last_sequence=sequence();return Ok(())}
 #[cfg(not(windows))]{let _=(id,state);Err("Disponible en Windows".into())}
}
/// Apply text received through an already authenticated peer channel. This is not
/// exposed as a frontend command: only a trusted sync service may call it.
#[cfg(windows)]
pub(crate) fn apply_remote_text(app:&AppHandle, text:String, peer_name:&str)->Result<(),String>{
 if text.is_empty()||text.len()>1024*1024{return Err("Texto recibido fuera del límite permitido".into())}
 let label:String=peer_name.chars().filter(|c|!c.is_control()).take(64).collect();
 let origin=if label.trim().is_empty(){"Otro equipo".to_string()}else{label};
 let history=app.state::<ClipboardHistory>();
 let mut data=history.0.lock().map_err(|_|"Portapapeles ocupado")?;
 let mut clip=arboard::Clipboard::new().map_err(|_|"No se pudo abrir el portapapeles")?;
 clip.set_text(text.clone()).map_err(|_|"No se pudo actualizar el portapapeles")?;
 // Suppress the matching local clipboard notification to prevent echo loops.
 data.last_sequence=sequence();
 if !data.paused{
  data.next_id=data.next_id.wrapping_add(1);let id=data.next_id;
  let at=SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
  data.items.insert(0,Entry{id,at,content:Content::Text(text),origin});
  while data.items.len()>MAX_ITEMS||data.items.iter().map(|i|i.content.bytes()).sum::<usize>()>MAX_TOTAL_BYTES{data.items.pop();}
 }
 drop(data);let _=app.emit("clipboard-history-changed",());Ok(())
}
pub fn start(app:AppHandle){
 #[cfg(windows)]std::thread::spawn(move||{let history=app.state::<ClipboardHistory>().inner().clone();loop{std::thread::sleep(Duration::from_millis(500));if app.get_webview_window("main").is_none(){break}let Ok(mut data)=history.0.lock()else{continue};let seq=sequence();if data.paused{data.last_sequence=seq;continue}if seq==0||seq==data.last_sequence{continue}data.last_sequence=seq;if allows_history(){if let Some(content)=capture(){if sequence()!=seq{continue}let bytes=content.bytes();if bytes>MAX_TOTAL_BYTES{continue}data.next_id=data.next_id.wrapping_add(1);let id=data.next_id;let at=SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();data.items.insert(0,Entry{id,at,content,origin:"Este equipo".into()});while data.items.len()>MAX_ITEMS||data.items.iter().map(|i|i.content.bytes()).sum::<usize>()>MAX_TOTAL_BYTES{data.items.pop();}drop(data);let _=app.emit("clipboard-history-changed",());}}}});
 #[cfg(not(windows))]let _=app;
}
