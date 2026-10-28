//! Publish a fresh CF_HDROP selection for Explorer and other Windows apps.
use std::{path::PathBuf,sync::OnceLock};
use tauri::{AppHandle,Manager};

static OWNER:OnceLock<isize>=OnceLock::new();
pub(crate) fn init(app:&AppHandle)->Result<(),String>{
 let window=app.get_webview_window("main").ok_or("No se encontró la ventana de Bimu")?;
 let owner=window.hwnd().map_err(|_|"No se pudo obtener la ventana de Bimu")?.0 as isize;
 if owner==0{return Err("No se pudo obtener la ventana de Bimu".into())}
 OWNER.set(owner).map_err(|_|"La ventana ya está registrada".to_string())
}
pub(crate) fn replace(_app:&AppHandle,paths:&[PathBuf])->Result<(),String>{
 let owner=*OWNER.get().ok_or("No se pudo obtener la ventana de Bimu")?;
 replace_with_owner(owner,paths)
}
fn replace_with_owner(owner:isize,paths:&[PathBuf])->Result<(),String>{
 if owner==0{return Err("No se pudo obtener la ventana de Bimu".into())}
 if paths.is_empty()||paths.iter().any(|path|!path.is_absolute()||!path.exists()){
  return Err("Uno de los archivos ya no está disponible".into())
 }
 // Never silently alter a Windows path if it contains unsupported UTF-16.
 let values:Vec<&str>=paths.iter().map(|path|path.to_str().ok_or("Nombre de archivo no compatible")).collect::<Result<_,_>>()?;
 let _clipboard=clipboard_win::Clipboard::new_attempts_for(owner as _,10).map_err(|_|"No se pudo abrir el portapapeles")?;
 // Both operations use the same open clipboard. This removes prior Shell/OLE
 // formats, instead of leaving a previous Explorer selection alongside CF_HDROP.
 clipboard_win::raw::empty().map_err(|_|"No se pudo reemplazar el portapapeles")?;
 clipboard_win::raw::set_file_list(&values).map_err(|_|"No se pudieron copiar los archivos")?;
 Ok(())
}

#[cfg(test)]mod tests{
 use super::*;
 /// Requires an interactive Windows session and overwrites its clipboard.
 #[test] #[ignore = "requires an interactive Windows clipboard"]
 fn replacing_files_removes_previous_clipboard_formats(){
  use std::{fs,time::{SystemTime,UNIX_EPOCH}};
  #[link(name="kernel32")]extern "system"{fn GetConsoleWindow()->isize;}
  let owner=unsafe{GetConsoleWindow()};assert_ne!(owner,0,"run from a Windows console");
  let nonce=SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
  let dir=std::env::temp_dir().join(format!("bimu-clipboard-test-{}-{nonce}",std::process::id()));fs::create_dir(&dir).unwrap();
  let old=dir.join("anterior.txt");let new=dir.join("nueva imagen.png");fs::write(&old,b"a").unwrap();fs::write(&new,b"b").unwrap();
  replace_with_owner(owner,&[old]).unwrap();
  let marker=clipboard_win::register_format("BimuTestOldShellFormat").unwrap().get();
  {let _c=clipboard_win::Clipboard::new_attempts_for(owner as _,10).unwrap();clipboard_win::raw::set_without_clear(marker,&[1,0,0,0]).unwrap();}
  replace_with_owner(owner,&[new.clone()]).unwrap();
  {let _c=clipboard_win::Clipboard::new_attempts_for(owner as _,10).unwrap();let mut paths=Vec::new();clipboard_win::raw::get_file_list_path(&mut paths).unwrap();assert_eq!(paths,vec![new]);assert!(!clipboard_win::raw::is_format_avail(marker));}
  fs::remove_dir_all(dir).unwrap();
 }
}
