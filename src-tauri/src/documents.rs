use std::{fs,io::{Cursor,Read},path::Path};
use calamine::{Reader,open_workbook_auto_from_rs};
use quick_xml::{Reader as XmlReader,events::Event};
pub const MAX_FILE:u64=10*1024*1024;
pub const MAX_TEXT:usize=65536;
#[derive(Clone)]pub struct Extracted{pub content:String,pub truncated:bool}
fn bounded(mut text:String)->Extracted{let truncated=text.len()>MAX_TEXT;if truncated{let mut end=MAX_TEXT;while !text.is_char_boundary(end){end-=1}text.truncate(end);}Extracted{content:text,truncated}}
fn zip_check(bytes:&[u8])->Result<(),String>{
    let mut archive=zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_|"Documento ZIP/Office inválido o protegido.")?;
    if archive.len()>2000{return Err("El documento contiene demasiados componentes.".into());}
    let mut total=0u64;for i in 0..archive.len(){let entry=archive.by_index(i).map_err(|_|"No se pudo leer el documento.")?;total=total.saturating_add(entry.size());if total>32*1024*1024{return Err("El documento descomprimido supera 32 MiB.".into());}}Ok(())
}
fn docx(bytes:&[u8])->Result<String,String>{
    zip_check(bytes)?;let mut archive=zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_|"DOCX inválido.")?;
    let mut xml=String::new();archive.by_name("word/document.xml").map_err(|_|"No se encontró el texto del DOCX.")?.take(8*1024*1024+1).read_to_string(&mut xml).map_err(|_|"No se pudo decodificar el DOCX.")?;
    if xml.len()>8*1024*1024{return Err("El cuerpo del DOCX es demasiado grande.".into());}
    let mut reader=XmlReader::from_str(&xml);let mut text=String::new();
    loop{match reader.read_event(){
        Ok(Event::Start(e)) if e.local_name().as_ref()==b"t"=>{let raw=reader.read_text(e.name()).map_err(|_|"Texto DOCX inválido.")?;let decoded=quick_xml::escape::unescape(&raw).map_err(|_|"Entidades XML inválidas.")?;text.push_str(&decoded);},
        Ok(Event::End(e)) if e.local_name().as_ref()==b"p"=>text.push('\n'),
        Ok(Event::Empty(e)) if e.local_name().as_ref()==b"tab"=>text.push('\t'),
        Ok(Event::Empty(e)) if e.local_name().as_ref()==b"br"=>text.push('\n'),
        Ok(Event::Eof)=>break,Err(_)=>return Err("El XML del DOCX está dañado.".into()),_=>{}
    }}Ok(text)
}
fn spreadsheet(bytes:&[u8],is_zip:bool)->Result<String,String>{
    if is_zip{zip_check(bytes)?}
    let mut book=open_workbook_auto_from_rs(Cursor::new(bytes.to_vec())).map_err(|_|"No se pudo leer la planilla (puede estar protegida o dañada).")?;
    let names=book.sheet_names().to_vec();let mut text=String::from("Planilla: valores guardados, sin recalcular fórmulas ni ejecutar macros. Límite de extracción: 8 hojas, 200 filas y 30 columnas por hoja.\n");
    for name in names.iter().take(8){let range=book.worksheet_range(name).map_err(|_|format!("No se pudo leer la hoja {name}."))?;text.push_str(&format!("\nHoja: {name} · {} filas × {} columnas\n",range.height(),range.width()));for (i,row) in range.rows().take(200).enumerate(){text.push_str(&format!("Fila {}: ",range.start().map(|(r,_)|r as usize).unwrap_or(0)+i+1));let values:Vec<_>=row.iter().take(30).enumerate().map(|(j,c)|format!("C{}={}",range.start().map(|(_,c)|c as usize).unwrap_or(0)+j+1,c.to_string().replace(['\n','\r']," "))).collect();text.push_str(&values.join(" | "));text.push('\n');if text.len()>MAX_TEXT{return Ok(text)}}if range.height()>200||range.width()>30{text.push_str("[Hoja recortada por límites de filas/columnas.]\n");}}
    if names.len()>8{text.push_str("[Hay más hojas no incluidas.]\n");}Ok(text)
}
fn plain(bytes:Vec<u8>)->Result<String,String>{
    if bytes.starts_with(&[0xff,0xfe])||bytes.starts_with(&[0xfe,0xff]){let le=bytes[0]==0xff;if (bytes.len()-2)%2!=0{return Err("Texto UTF-16 inválido.".into());}let units:Vec<u16>=bytes[2..].chunks_exact(2).map(|c|if le{u16::from_le_bytes([c[0],c[1]])}else{u16::from_be_bytes([c[0],c[1]])}).collect();return String::from_utf16(&units).map_err(|_|"Texto UTF-16 inválido.".into());}
    if bytes.contains(&0){return Err("El archivo contiene datos binarios.".into());}String::from_utf8(bytes).map(|s|s.trim_start_matches('\u{feff}').to_owned()).map_err(|_|"El texto debe estar codificado en UTF-8 o UTF-16 con BOM.".into())
}
pub fn extract(path:&Path)->Result<Extracted,String>{
    let meta=fs::metadata(path).map_err(|_|"No se pudo acceder al archivo.")?;if !meta.is_file(){return Err("La ruta no es un archivo regular.".into());}if meta.len()>MAX_FILE{return Err("El archivo supera 10 MiB.".into());}
    let mut bytes=Vec::new();fs::File::open(path).map_err(|_|"No se pudo abrir el archivo.")?.take(MAX_FILE+1).read_to_end(&mut bytes).map_err(|_|"No se pudo leer el archivo.")?;if bytes.len() as u64>MAX_FILE{return Err("El archivo supera 10 MiB.".into());}
    let ext=path.extension().and_then(|s|s.to_str()).unwrap_or("").to_ascii_lowercase();
    let text=match ext.as_str(){
        "pdf"=>std::panic::catch_unwind(||pdf_extract::extract_text_from_mem(&bytes)).map_err(|_|"El PDF no se pudo procesar.")?.map_err(|_|"PDF dañado, protegido o sin texto compatible.")?,
        "docx"=>docx(&bytes)?,"xls"|"xlsx"|"ods"=>spreadsheet(&bytes,ext!="xls")?,
        "txt"|"md"|"csv"|"tsv"|"json"|"log"|"yaml"|"yml"|"xml"|"html"|"css"|"js"|"jsx"|"ts"|"tsx"|"rs"|"py"=>plain(bytes)?,
        _=>return Err("Formato no compatible. Usá TXT, PDF, DOCX, XLS, XLSX, ODS o texto UTF-8/UTF-16.".into())
    };
    if text.trim().is_empty(){return Err(if ext=="pdf"{"No se encontró texto extraíble. Los PDF escaneados requieren OCR, todavía pendiente."}else{"No se encontró texto para analizar."}.into());}let mut result=bounded(text);if matches!(ext.as_str(),"xls"|"xlsx"|"ods")&&(result.content.contains("[Hoja recortada")||result.content.contains("[Hay más hojas")){result.truncated=true;}Ok(result)
}
#[cfg(test)]mod tests{use super::*;
    #[test]fn decodes_text_and_bounds_unicode(){assert_eq!(plain(vec![0xff,0xfe,b'h',0,b'i',0]).unwrap(),"hi");assert!(plain(vec![0,1]).is_err());let e=bounded("á".repeat(40000));assert!(e.truncated);assert!(e.content.len()<=MAX_TEXT);}
    #[test]fn extracts_word_paragraphs(){use std::io::Write;let mut zip=zip::ZipWriter::new(Cursor::new(Vec::new()));zip.start_file("word/document.xml",zip::write::SimpleFileOptions::default()).unwrap();zip.write_all(br#"<w:document xmlns:w="word"><w:p><w:r><w:t>Hola &amp; Bimu</w:t></w:r></w:p></w:document>"#).unwrap();let bytes=zip.finish().unwrap().into_inner();assert_eq!(docx(&bytes).unwrap(),"Hola & Bimu\n");}
}
