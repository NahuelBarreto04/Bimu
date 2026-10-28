//! Bounded application messages inside an already authenticated Noise channel.
use crate::pairing_transport::SecureChannel;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use crate::clipboard_files::FileBundle;
const MAX_TEXT: usize = 1024*1024;
const MAX_IMAGE: usize = 12*1024*1024;
const MAX_WIRE: usize = 17*1024*1024;
const CHUNK: usize = 32*1024;

#[derive(Clone, Debug, PartialEq)]
pub enum ClipboardPayload { Text(String), Image { width:usize, height:usize, rgba:Vec<u8> }, Files(Vec<PathBuf>), FileBundle(FileBundle) }
#[derive(Serialize,Deserialize)]
#[serde(tag="kind", rename_all="snake_case", deny_unknown_fields)]
enum WirePayload { Text { text:String }, Image { width:usize, height:usize, rgba:String }, Files { bundle:FileBundle } }
fn image_size(width:usize,height:usize)->Option<usize>{
 if width==0||height==0||width>16384||height>16384{return None}
 width.checked_mul(height)?.checked_mul(4).filter(|n|*n<=MAX_IMAGE)
}
fn encode(payload:ClipboardPayload)->Result<Vec<u8>,String>{
 let wire=match payload{
  ClipboardPayload::Text(text) if !text.is_empty()&&text.len()<=MAX_TEXT=>WirePayload::Text{text},
  ClipboardPayload::Image{width,height,rgba} if image_size(width,height)==Some(rgba.len())=>WirePayload::Image{width,height,rgba:STANDARD.encode(rgba)},
  ClipboardPayload::FileBundle(bundle)=>WirePayload::Files{bundle},
  _=>return Err("Contenido del portapapeles fuera de los límites".into()),
 };
 let encoded=serde_json::to_vec(&wire).map_err(|_|"No se pudo preparar el contenido")?;
 if encoded.len()>MAX_WIRE{return Err("Contenido demasiado grande".into())}Ok(encoded)
}
fn decode(data:&[u8])->Result<ClipboardPayload,String>{
 let wire:WirePayload=serde_json::from_slice(data).map_err(|_|"Formato del portapapeles inválido")?;
 match wire{
  WirePayload::Text{text} if !text.is_empty()&&text.len()<=MAX_TEXT=>Ok(ClipboardPayload::Text(text)),
  WirePayload::Files{bundle}=>Ok(ClipboardPayload::FileBundle(bundle)),
  WirePayload::Image{width,height,rgba}=>{
   let expected=image_size(width,height).ok_or("Dimensiones de imagen inválidas")?;
   if rgba.len()>((expected+2)/3)*4{return Err("Imagen demasiado grande".into())}
   let bytes=STANDARD.decode(rgba).map_err(|_|"Imagen inválida")?;
   if bytes.len()!=expected{return Err("Tamaño de imagen inválido".into())}
   Ok(ClipboardPayload::Image{width,height,rgba:bytes})
  },
  _=>Err("Contenido del portapapeles fuera de los límites".into()),
 }
}
pub fn send_turn(channel:&mut SecureChannel,payload:Option<ClipboardPayload>)->Result<(),String>{
 match payload{
  None=>channel.send(&[0]),
  Some(payload)=>{
   let data=encode(payload)?;
   let mut header=[0u8;5];header[0]=1;header[1..].copy_from_slice(&(data.len() as u32).to_be_bytes());
   channel.send(&header)?;for chunk in data.chunks(CHUNK){channel.send(chunk)?}Ok(())
  }
 }
}
pub fn receive_turn(channel:&mut SecureChannel)->Result<Option<ClipboardPayload>,String>{
 let header=channel.receive()?;
 if header==[0]{return Ok(None)}
 if header.len()!=5||header[0]!=1{return Err("Cabecera de sincronización inválida".into())}
 let size=u32::from_be_bytes(header[1..5].try_into().map_err(|_|"Cabecera inválida")?) as usize;
 if size==0||size>MAX_WIRE{return Err("Tamaño de sincronización inválido".into())}
 let mut data=Vec::with_capacity(size);
 while data.len()<size{let chunk=channel.receive()?;if chunk.is_empty()||chunk.len()>CHUNK||chunk.len()>size-data.len(){return Err("Fragmento de sincronización inválido".into())}data.extend_from_slice(&chunk)}
 decode(&data).map(Some)
}
#[cfg(test)] mod tests{
 use super::*;use crate::pairing_core::Role;use crate::pairing_transport::pair;use std::{net::{TcpListener,TcpStream},thread};
 #[test] fn text_and_images_round_trip_over_paired_channel(){
  let listener=TcpListener::bind("127.0.0.1:0").unwrap();let addr=listener.local_addr().unwrap();
  let text="¡hola! ".repeat(10000);let sent=text.clone();
  let host=thread::spawn(move||{let (s,_)=listener.accept().unwrap();let mut c=pair(s,Role::Host,"012345").unwrap();assert_eq!(receive_turn(&mut c).unwrap(),Some(ClipboardPayload::Text(sent)));send_turn(&mut c,Some(ClipboardPayload::Image{width:2,height:1,rgba:vec![1,2,3,4,5,6,7,8]})).unwrap();assert_eq!(receive_turn(&mut c).unwrap(),None)});
  let mut c=pair(TcpStream::connect(addr).unwrap(),Role::Client,"012345").unwrap();send_turn(&mut c,Some(ClipboardPayload::Text(text))).unwrap();assert_eq!(receive_turn(&mut c).unwrap(),Some(ClipboardPayload::Image{width:2,height:1,rgba:vec![1,2,3,4,5,6,7,8]}));send_turn(&mut c,None).unwrap();host.join().unwrap();
 }
 #[test] fn selected_files_cross_the_channel_and_are_materialized(){
  use std::{fs,time::{SystemTime,UNIX_EPOCH}};
  let unique=SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
  let dir=std::env::temp_dir().join(format!("bimu-wire-files-{}-{unique}",std::process::id()));
  fs::create_dir(&dir).unwrap();fs::write(dir.join("foto.png"),b"png bytes").unwrap();fs::write(dir.join("doc.pdf"),b"pdf bytes").unwrap();
  let bundle=crate::clipboard_files::pack(&[dir.join("foto.png"),dir.join("doc.pdf")]).unwrap();
  let listener=TcpListener::bind("127.0.0.1:0").unwrap();let addr=listener.local_addr().unwrap();
  let receiver=thread::spawn(move||{let(s,_)=listener.accept().unwrap();let mut channel=pair(s,Role::Host,"012345").unwrap();receive_turn(&mut channel).unwrap().unwrap()});
  let mut channel=pair(TcpStream::connect(addr).unwrap(),Role::Client,"012345").unwrap();send_turn(&mut channel,Some(ClipboardPayload::FileBundle(bundle))).unwrap();
  let received=receiver.join().unwrap();let ClipboardPayload::FileBundle(bundle)=received else{panic!("expected file bundle")};
  let destination=dir.join("received");let paths=crate::clipboard_files::unpack(&bundle,&destination).unwrap();assert_eq!(paths.len(),2);assert_eq!(fs::read(destination.join("foto.png")).unwrap(),b"png bytes");assert_eq!(fs::read(destination.join("doc.pdf")).unwrap(),b"pdf bytes");fs::remove_dir_all(dir).unwrap();
 }
 #[test] fn rejects_invalid_images_and_large_text(){
  assert!(encode(ClipboardPayload::Text("x".repeat(MAX_TEXT+1))).is_err());
  assert!(encode(ClipboardPayload::Image{width:2,height:2,rgba:vec![1,2]}).is_err());
  assert!(decode(br#"{"kind":"image","width":999999,"height":3,"rgba":""}"#).is_err());
 }
}
