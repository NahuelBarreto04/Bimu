use std::{path::{Path,PathBuf},collections::{HashSet,VecDeque},sync::atomic::{AtomicBool,Ordering},time::{Duration,Instant}};
use serde::Serialize;
use crate::{application_intent::normalized,assistant_core::{local_path,skip_directory}};

// Opening documents must never turn a filename search into script/program execution.
pub fn allowed_extension(extension:&str)->bool {
    matches!(extension.to_ascii_lowercase().as_str(),"pdf"|"txt"|"md"|"csv"|"doc"|"docx"|"odt"|"xls"|"xlsx"|"ods"|"ppt"|"pptx"|"jpg"|"jpeg"|"png"|"gif"|"webp"|"bmp"|"mp3"|"wav"|"ogg"|"flac"|"mp4"|"mov"|"mkv"|"avi")
}
pub fn regular_local(path:&Path)->bool {
    if !local_path(path){return false;}
    let Ok(meta)=std::fs::symlink_metadata(path) else{return false;};
    if meta.file_type().is_symlink(){return false;}
    #[cfg(windows)] {use std::os::windows::fs::MetadataExt;if meta.file_attributes()&0x400!=0{return false;}}
    true
}
pub fn openable_file(path:&Path)->Result<PathBuf,String>{
    if !regular_local(path){return Err("El archivo no es un documento local disponible. Volvé a buscarlo.".into());}
    let path=path.canonicalize().map_err(|_|"El archivo ya no está disponible.")?;
    if !path.is_file()||!local_path(&path)||!path.extension().and_then(|e|e.to_str()).is_some_and(allowed_extension){return Err("Ese tipo de archivo no se abre desde la búsqueda. Usá documentos, imágenes, audio o video.".into());}
    Ok(crate::assistant_core::shell_folder_path(path))
}
#[derive(Clone,Serialize,Debug)]pub struct FileMatch{pub name:String,pub path:PathBuf,pub exact:bool}
#[derive(Serialize,Debug)]pub struct FileSearch{pub matches:Vec<FileMatch>,pub incomplete:bool,pub cancelled:bool,pub skipped:usize,pub visited:usize}
pub fn search_files(roots:Vec<PathBuf>,query:&str,extension:Option<&str>,cancel:&AtomicBool,budget:Duration,max_entries:usize)->Result<FileSearch,String>{
    let query=normalized(query);
    if query.is_empty(){return Err("Indicá parte del nombre del archivo.".into());}
    let extension=extension.map(|e|e.trim_start_matches('.').to_ascii_lowercase()).filter(|e|!e.is_empty());
    if extension.as_ref().is_some_and(|e|!allowed_extension(e)){return Err("Ese tipo de archivo no está disponible para apertura por voz.".into());}
    let started=Instant::now();let mut queue:VecDeque<_>=roots.into_iter().collect();let mut seen=HashSet::new();
    let mut result=FileSearch{matches:vec![],incomplete:false,cancelled:false,skipped:0,visited:0};
    'scan:while let Some(dir)=queue.pop_front(){
        if cancel.load(Ordering::Relaxed){result.cancelled=true;break;}
        if started.elapsed()>=budget||result.visited>=max_entries||result.matches.len()>=50{result.incomplete=true;break;}
        if !regular_local(&dir)||!dir.is_dir(){continue;}
        if !seen.insert(dir.to_string_lossy().to_lowercase()){continue;}
        let entries=match std::fs::read_dir(dir){Ok(e)=>e,Err(_)=>{result.skipped+=1;continue;}};
        for entry in entries{
            if cancel.load(Ordering::Relaxed){result.cancelled=true;break 'scan;}
            if started.elapsed()>=budget||result.visited>=max_entries||result.matches.len()>=50{result.incomplete=true;break 'scan;}
            result.visited+=1;let entry=match entry{Ok(e)=>e,Err(_)=>{result.skipped+=1;continue;}};
            let path=entry.path();let Ok(kind)=entry.file_type() else{result.skipped+=1;continue;};
            if kind.is_symlink(){continue;}
            if kind.is_dir(){if !skip_directory(&entry.file_name().to_string_lossy()){queue.push_back(path);}continue;}
            if !kind.is_file()||!regular_local(&path){continue;}
            let ext=path.extension().unwrap_or_default().to_string_lossy().to_ascii_lowercase();
            if !allowed_extension(&ext)||extension.as_ref().is_some_and(|wanted|wanted!=&ext){continue;}
            let name=entry.file_name().to_string_lossy().into_owned();let full=normalized(&name);let stem=normalized(&path.file_stem().unwrap_or_default().to_string_lossy());
            if query.split_whitespace().all(|word|full.contains(word)){result.matches.push(FileMatch{name,path,exact:full==query||stem==query});}
        }
    }
    result.matches.sort_by(|a,b|b.exact.cmp(&a.exact).then(a.path.cmp(&b.path)));result.matches.dedup_by(|a,b|a.path==b.path);Ok(result)
}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn searches_documents_without_reading_or_accepting_executables(){
        let root=std::env::temp_dir().join(format!("bimu-file-search-{}",std::process::id()));let _=std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("Documents")).unwrap();std::fs::create_dir_all(root.join("node_modules")).unwrap();
        for file in ["Documents/Presupuesto José.pdf","Documents/Presupuesto José.txt","Documents/Presupuesto José.exe","node_modules/Presupuesto José.pdf"]{std::fs::write(root.join(file),b"not readable PDF content, search must not parse this").unwrap();}
        let cancel=AtomicBool::new(false);let r=search_files(vec![root.clone()],"presupuesto jose",Some("pdf"),&cancel,Duration::from_secs(2),100).unwrap();assert_eq!(r.matches.len(),1);assert!(r.matches[0].exact);assert!(!r.incomplete);
        assert!(openable_file(&r.matches[0].path).is_ok());assert!(openable_file(&root.join("Documents/Presupuesto José.exe")).is_err());
        assert_eq!(search_files(vec![root.clone()],"presupuesto",None,&cancel,Duration::from_secs(2),100).unwrap().matches.len(),2);
        assert!(search_files(vec![root.clone()],"presupuesto",None,&cancel,Duration::from_secs(2),1).unwrap().incomplete);
        assert!(search_files(vec![],"x",Some("lnk"),&cancel,Duration::from_secs(1),100).is_err());
        cancel.store(true,Ordering::Relaxed);assert!(search_files(vec![root.clone()],"presupuesto",None,&cancel,Duration::from_secs(2),100).unwrap().cancelled);
        std::fs::remove_dir_all(root).unwrap();assert!(openable_file(&r.matches[0].path).is_err());
    }
    #[test]fn rejects_programs_scripts_links_and_remote_paths(){for ext in ["exe","msi","cmd","bat","ps1","js","vbs","lnk","url","html","svg"]{assert!(!allowed_extension(ext));}assert!(allowed_extension("PDF"));assert!(!regular_local(Path::new(r"\\server\share\a.pdf")));}
    #[cfg(unix)]#[test]fn does_not_follow_linked_documents_or_folders(){
        let root=std::env::temp_dir().join(format!("bimu-file-links-{}",std::process::id()));let _=std::fs::remove_dir_all(&root);std::fs::create_dir_all(root.join("real")).unwrap();std::fs::write(root.join("real/factura.pdf"),b"test").unwrap();std::os::unix::fs::symlink(root.join("real/factura.pdf"),root.join("link.pdf")).unwrap();std::os::unix::fs::symlink(root.join("real"),root.join("linked")).unwrap();assert!(openable_file(&root.join("link.pdf")).is_err());let cancel=AtomicBool::new(false);assert_eq!(search_files(vec![root.clone()],"factura",None,&cancel,Duration::from_secs(1),100).unwrap().matches.len(),1);std::fs::remove_dir_all(root).unwrap();
    }
}
