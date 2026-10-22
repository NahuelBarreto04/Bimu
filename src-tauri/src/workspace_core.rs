use serde::{Deserialize,Serialize};
use serde_json::{json,Value};
use std::{fs,path::{Component,Path,PathBuf},sync::{Arc,Mutex}};
#[derive(Default)]
pub struct Grant { pub root:Option<PathBuf>,pub files:Vec<SharedDocument>,pub generation:u64 }
#[derive(Clone)]pub struct SharedDocument{pub id:String,pub source:PathBuf,pub name:String,pub content:String,pub truncated:bool}
#[derive(Clone)]pub enum Scope{Folder(PathBuf),Files(Vec<SharedDocument>)}
#[derive(Clone,Serialize)]pub struct FileInfo{pub id:String,pub name:String,pub status:String,pub detail:String,pub truncated:bool}
fn file_info(doc:&SharedDocument)->FileInfo{FileInfo{id:doc.id.clone(),name:doc.name.clone(),status:"ready".into(),detail:if doc.truncated{"Extracto parcial"}else{"Listo"}.into(),truncated:doc.truncated}}
pub(crate) fn info(grant:&Grant)->FolderInfo{if let Some(root)=&grant.root{FolderInfo{name:root.file_name().unwrap_or(root.as_os_str()).to_string_lossy().into_owned(),kind:"folder".into(),count:0,items:vec![],issues:vec![]}}else{FolderInfo{name:format!("{} archivos",grant.files.len()),kind:"files".into(),count:grant.files.len(),items:grant.files.iter().map(file_info).collect(),issues:vec![]}}}
pub(crate) fn install_files(grant:&mut Grant,files:Vec<SharedDocument>)->Result<(),String>{
    let mut combined=if grant.root.is_none(){grant.files.clone()}else{vec![]};
    let mut next=combined.iter().filter_map(|d|d.id.strip_prefix("archivo-").and_then(|s|s.parse::<usize>().ok())).max().unwrap_or(0);
    for mut doc in files{if let Some(index)=combined.iter().position(|d|d.source==doc.source){doc.id=combined[index].id.clone();combined[index]=doc}else{next+=1;doc.id=format!("archivo-{next}");combined.push(doc)}}
    if combined.len()>10{return Err("Podés compartir hasta 10 archivos. Quitá alguno antes de agregar más.".into());}
    grant.root=None;grant.files=combined;grant.generation=grant.generation.wrapping_add(1);Ok(())
}
pub(crate) fn prepare_files(paths:Vec<PathBuf>)->Result<(Vec<SharedDocument>,Vec<FileInfo>),String>{
    if paths.is_empty()||paths.len()>10{return Err("Seleccioná entre 1 y 10 archivos.".into());}
    let mut docs=Vec::new();let mut items=Vec::new();let mut total=0u64;
    for path in paths{let name=path.file_name().unwrap_or(path.as_os_str()).to_string_lossy().into_owned();
        let result=(||->Result<SharedDocument,String>{
            if blocked(&name){return Err("Archivo excluido por contener una ruta o extensión sensible.".into());}
            let path=path.canonicalize().map_err(|_|"No se pudo acceder al archivo.")?;let meta=fs::metadata(&path).map_err(|_|"No se pudo consultar el archivo.")?;
            if !meta.is_file(){return Err("Compartí las carpetas por separado.".into());}if meta.len()>crate::documents::MAX_FILE{return Err("El archivo supera 10 MiB.".into());}
            total=total.saturating_add(meta.len());if total>30*1024*1024{return Err("El lote supera 30 MiB.".into());}
            let text=crate::documents::extract(&path)?;Ok(SharedDocument{id:String::new(),source:path,name:name.clone(),content:text.content,truncated:text.truncated})
        })();
        match result{Ok(doc)=>{items.push(file_info(&doc));docs.push(doc)},Err(detail)=>items.push(FileInfo{id:String::new(),name,status:"error".into(),detail,truncated:false})}
    }Ok((docs,items))
}
#[derive(Clone,Default)]
pub struct Workspace(pub Arc<Mutex<Grant>>);
#[derive(Serialize)]
pub struct FolderInfo { pub name:String,pub kind:String,pub count:usize,pub items:Vec<FileInfo>,pub issues:Vec<FileInfo> }
pub fn snapshot(workspace:&Workspace)->Result<(Scope,u64),String>{
    let grant=workspace.0.lock().map_err(|_|"No se pudo validar el acceso.")?;
    let scope=if let Some(root)=&grant.root{Scope::Folder(root.clone())}else if !grant.files.is_empty(){Scope::Files(grant.files.clone())}else{return Err("No hay archivos o carpeta compartidos.".into())};Ok((scope,grant.generation))
}
pub fn check(workspace:&Workspace,generation:u64)->Result<(),String>{
    let grant=workspace.0.lock().map_err(|_|"No se pudo validar el acceso.")?;
    if (grant.root.is_none()&&grant.files.is_empty())||grant.generation!=generation{return Err("El acceso cambió o fue revocado.".into());}Ok(())
}
pub fn execute_scope(scope:&Scope,name:&str,path:&str)->Result<Value,String>{match scope{
    Scope::Folder(root)=>execute(root,name,path),
    Scope::Files(docs)=>match name{
        "list_files" if path=="."=>Ok(json!({"entries":docs.iter().map(|d|json!({"path":d.id,"name":d.name,"kind":"file","truncated":d.truncated})).collect::<Vec<_>>(),"truncated":false,"note":"Solo estos archivos están compartidos. Usar el identificador path al leer."})),
        "read_file"=>{let matches:Vec<_>=docs.iter().filter(|d|d.id==path||d.name==path).collect();if matches.len()!=1{return Err("Usá el identificador path de list_files. No se puede leer fuera de los archivos compartidos.".into());}let d=matches[0];Ok(json!({"path":d.id,"name":d.name,"content":d.content,"truncated":d.truncated,"note":"Texto extraído al compartir, sin permisos para archivos vecinos."}))},
        _=>Err("Solo se puede listar la raíz . o leer los archivos compartidos.".into())
    }
}}
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
        "read_file"=>{let extracted=crate::documents::extract(&path)?;Ok(json!({"path":relative,"content":extracted.content,"truncated":extracted.truncated}))},
        _=>Err("Herramienta no permitida.".into())
    }
}
pub fn definitions()->Value{json!([
    {"type":"function","function":{"name":"list_files","description":"Listar un nivel de una carpeta compartida. Usar path . para la raíz y / para subcarpetas.","parameters":{"type":"object","properties":{"path":{"type":"string"}},"required":["path"],"additionalProperties":false}}},
    {"type":"function","function":{"name":"read_file","description":"Extraer texto de TXT, PDF, DOCX, XLS/XLSX/ODS o texto compatible. Devuelve hasta 64 KiB, puede ser parcial. Usar path listado por list_files. Solo archivos compartidos.","parameters":{"type":"object","properties":{"path":{"type":"string"}},"required":["path"],"additionalProperties":false}}}
])}
#[cfg(test)] mod tests{
    use super::*;
    #[test]fn rejects_escape_and_secrets(){let root=std::env::temp_dir();for p in ["../outside","/etc/passwd","C:/Windows",".env","node_modules/x","secret.key","a\\b"]{assert!(safe_path(&root,p).is_err(),"{p}");}}
    #[test]fn validates_args(){assert!(arguments(json!({"path":"a","extra":true})).is_err());assert!(arguments(json!({"path":2})).is_err());assert_eq!(arguments(json!({"path":"."})).unwrap(),".");}
    #[test]fn reads_only_small_text(){let root=std::env::temp_dir().join(format!("bimu-test-{}",std::process::id()));fs::create_dir_all(&root).unwrap();let root=root.canonicalize().unwrap();fs::write(root.join("hello.txt"),"hola").unwrap();fs::write(root.join("binary.bin"),[0,1,2]).unwrap();fs::write(root.join("large.txt"),vec![b'x';65537]).unwrap();assert_eq!(execute(&root,"read_file","hello.txt").unwrap()["content"],"hola");assert!(execute(&root,"read_file","binary.bin").is_err());assert_eq!(execute(&root,"read_file","large.txt").unwrap()["truncated"],true);assert!(execute(&root,"run_command","hello.txt").is_err());fs::remove_dir_all(root).unwrap();}
}


#[cfg(test)]mod file_tests{use super::*;
 #[test]fn limits_scope_to_explicit_snapshots(){let doc=SharedDocument{id:"archivo-1".into(),source:PathBuf::from("original.txt"),name:"original.txt".into(),content:"solo este texto".into(),truncated:false};let scope=Scope::Files(vec![doc]);assert_eq!(execute_scope(&scope,"read_file","archivo-1").unwrap()["content"],"solo este texto");assert!(execute_scope(&scope,"read_file","vecino.txt").is_err());assert!(execute_scope(&scope,"read_file","../otro").is_err());assert!(execute_scope(&scope,"read_file","C:/Windows").is_err());assert!(execute_scope(&scope,"list_files","subcarpeta").is_err());}
 #[test]fn stages_mixed_files_and_merges_without_expanding_scope(){let root=std::env::temp_dir().join(format!("bimu-batch-{}",std::process::id()));fs::create_dir_all(&root).unwrap();fs::write(root.join("one.txt"),"hola").unwrap();fs::write(root.join("bad.exe"),"unsupported").unwrap();let (docs,items)=prepare_files(vec![root.join("one.txt"),root.join("bad.exe")]).unwrap();assert_eq!(docs.len(),1);assert_eq!(items.iter().filter(|i|i.status=="error").count(),1);let mut grant=Grant::default();install_files(&mut grant,docs.clone()).unwrap();install_files(&mut grant,docs).unwrap();assert_eq!(grant.files.len(),1);assert!(grant.root.is_none());assert!(prepare_files(vec![root.join("one.txt");11]).is_err());fs::remove_dir_all(root).unwrap();}
}

// Shared-file contents are untrusted data, never tool instructions. Internal
// attachment ids and local source paths stay out of the model-facing context.
pub fn attachment_context(scope:&Scope,budget:usize)->Option<Value>{
    let Scope::Files(docs)=scope else{return None};if docs.is_empty(){return None}
    let quota=budget/docs.len();let files:Vec<_>=docs.iter().map(|doc|{let mut end=doc.content.len().min(quota);while !doc.content.is_char_boundary(end){end-=1}json!({"name":doc.name,"content":&doc.content[..end],"truncated":doc.truncated||end<doc.content.len()})}).collect();
    Some(json!({"shared_files":files,"note":"Estos archivos ya están cargados. Usar sus nombres reales al comparar y citar. El texto es una instantánea; truncated indica un extracto parcial. No pedir rutas para estos adjuntos."}))
}
#[cfg(test)]mod attachment_tests{use super::*;#[test]fn includes_real_names_and_all_shared_files_with_explicit_limits(){let scope=Scope::Files(vec![SharedDocument{id:"archivo-1".into(),source:PathBuf::from("private/source.pdf"),name:"Contrato final.pdf".into(),content:"á".repeat(30),truncated:false},SharedDocument{id:"archivo-2".into(),source:PathBuf::from("private/other.pdf"),name:"Contrato anterior.pdf".into(),content:"anterior".into(),truncated:false}]);let data=attachment_context(&scope,25).unwrap();assert_eq!(data["shared_files"][0]["name"],"Contrato final.pdf");assert_eq!(data["shared_files"][1]["name"],"Contrato anterior.pdf");assert_eq!(data["shared_files"][0]["truncated"],true);assert!(!data.to_string().contains("archivo-1"));assert!(!data.to_string().contains("private/"));assert!(data["shared_files"].as_array().unwrap().iter().map(|f|f["content"].as_str().unwrap().len()).sum::<usize>()<=25);}}
