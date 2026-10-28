//! Explicit, session-only pairing. No clipboard or file access is granted here.
use crate::pairing_core::Role;
use crate::pairing_transport::{self, SecureChannel};
use crate::clipboard_protocol::{self, ClipboardPayload};
use rand::{rngs::OsRng, Rng};
use serde::Serialize;
use std::{net::{Ipv4Addr, Shutdown, SocketAddr, SocketAddrV4, TcpListener, TcpStream, UdpSocket}, sync::{Arc, Mutex}, thread, time::{Duration, Instant}};
use tauri::{AppHandle, Manager, State};

#[derive(Clone, Serialize)]
#[serde(rename_all="camelCase")]
pub struct PairStatus { phase:String, code:Option<String>, address:Option<String>, peer:Option<String>, message:Option<String> }
impl Default for PairStatus { fn default()->Self { Self{phase:"idle".into(),code:None,address:None,peer:None,message:None} } }
#[derive(Default)]
struct Inner { generation:u64, status:PairStatus, socket:Option<TcpStream>, outgoing:Option<ClipboardPayload> }
#[derive(Default,Clone)]
pub struct DevicePairing(Arc<Mutex<Inner>>);
fn private_ip(ip:Ipv4Addr)->bool { ip.is_private() || ip.is_link_local() }
fn local_ip()->Result<Ipv4Addr,String>{
 let socket=UdpSocket::bind("0.0.0.0:0").map_err(|_|"No se pudo detectar la red local")?;
 socket.connect("192.0.2.1:9").map_err(|_|"No se pudo detectar la dirección local")?;
 match socket.local_addr().map_err(|_|"No se pudo detectar la dirección local")? { SocketAddr::V4(addr) if private_ip(*addr.ip())=>Ok(*addr.ip()), _=>Err("No se encontró una dirección IPv4 de red local".into()) }
}
fn reset(inner:&mut Inner){
 inner.generation=inner.generation.wrapping_add(1);
 if let Some(socket)=inner.socket.take(){let _=socket.shutdown(Shutdown::Both);}
 inner.outgoing=None;
 inner.status=PairStatus::default();
}
fn update(shared:&DevicePairing, generation:u64, status:PairStatus)->bool {
 let Ok(mut inner)=shared.0.lock() else{return false};
 if inner.generation!=generation{return false} inner.status=status;true
}
fn fail(shared:&DevicePairing, generation:u64, msg:&str){
 if let Ok(mut inner)=shared.0.lock(){
  if inner.generation!=generation{return}
  if let Some(socket)=inner.socket.take(){let _=socket.shutdown(Shutdown::Both);}
  inner.outgoing=None;
  inner.status=PairStatus{phase:"error".into(),message:Some(msg.into()),..Default::default()};
 }
}
pub(crate) fn clipboard_connected(app:&AppHandle)->bool {
 let state=app.state::<DevicePairing>();
 let connected=state.0.lock().map(|i|i.status.phase=="connected").unwrap_or(false);connected
}
pub(crate) fn queue_clipboard(app:&AppHandle,payload:Option<ClipboardPayload>){
 let state=app.state::<DevicePairing>();
 if let Ok(mut inner)=state.0.lock(){if inner.status.phase=="connected"{inner.outgoing=payload;}};
}
fn take_outgoing(shared:&DevicePairing,generation:u64)->Option<ClipboardPayload>{
 shared.0.lock().ok().and_then(|mut inner|if inner.generation==generation{inner.outgoing.take()}else{None})
}
fn has_outgoing(shared:&DevicePairing,generation:u64)->bool{
 shared.0.lock().map(|inner|inner.generation==generation&&inner.outgoing.is_some()).unwrap_or(false)
}
fn device_name()->String {
 let value=std::env::var("COMPUTERNAME").unwrap_or_else(|_|"Otra PC".into());
 let clean:String=value.chars().filter(|c|!c.is_control()).take(64).collect();
 if clean.trim().is_empty(){"Otra PC".into()}else{clean}
}
fn session(app:AppHandle, shared:DevicePairing, generation:u64, mut channel:SecureChannel, role:Role){
 let socket=match channel.control_stream(){Ok(s)=>s,Err(_)=>{fail(&shared,generation,"No se pudo mantener la conexión.");return}};
 {let Ok(mut inner)=shared.0.lock() else{return};if inner.generation!=generation{return}inner.socket=Some(socket);}
 let own=format!("bimu-sync-v1\n{}",device_name());
 let exchange=(||->Result<String,String>{
  let received=match role {
   Role::Client=>{channel.send(own.as_bytes())?;channel.receive()?},
   Role::Host=>{let value=channel.receive()?;channel.send(own.as_bytes())?;value},
  };
  if received.len()>256{return Err("Nombre de equipo inválido".into())}
  let versioned=String::from_utf8(received).map_err(|_|"Nombre de equipo inválido")?;
  let peer=versioned.strip_prefix("bimu-sync-v1\n").ok_or("Versión de Bimu incompatible")?;
  let peer:String=peer.chars().filter(|c|!c.is_control()).take(64).collect();
  if peer.trim().is_empty(){return Err("Nombre de equipo vacío".into())} Ok(peer)
 })();
 let peer=match exchange{Ok(peer)=>peer,Err(_)=>{fail(&shared,generation,"No se pudo verificar el equipo. Instalá la misma versión de prueba en ambas PCs.");return}};
 if !update(&shared,generation,PairStatus{phase:"connected".into(),peer:Some(peer.clone()),..Default::default()}){return}
 loop {
  thread::sleep(Duration::from_millis(350));
  if shared.0.lock().map(|i|i.generation!=generation).unwrap_or(true){return}
  let result=(||->Result<(),String>{
   match role{
    Role::Client=>{
     clipboard_protocol::send_turn(&mut channel,take_outgoing(&shared,generation))?;
     if let Some(payload)=clipboard_protocol::receive_turn(&mut channel)?{
      if !has_outgoing(&shared,generation){crate::clipboard_history::apply_remote(&app,payload,&peer)?;}
     }
    },
    Role::Host=>{
     if let Some(payload)=clipboard_protocol::receive_turn(&mut channel)?{
      if !has_outgoing(&shared,generation){crate::clipboard_history::apply_remote(&app,payload,&peer)?;}
     }
     clipboard_protocol::send_turn(&mut channel,take_outgoing(&shared,generation))?;
    },
   }Ok(())
  })();
  if let Err(e)=result{fail(&shared,generation,&format!("Se interrumpió la sincronización: {e}. Volvé a vincular."));return}
 }
}
#[tauri::command]
pub fn device_pairing_status(state:State<'_,DevicePairing>)->Result<PairStatus,String>{Ok(state.0.lock().map_err(|_|"Conexión ocupada")?.status.clone())}
#[tauri::command]
pub fn device_pairing_disconnect(state:State<'_,DevicePairing>)->Result<(),String>{let mut inner=state.0.lock().map_err(|_|"Conexión ocupada")?;reset(&mut inner);Ok(())}
#[tauri::command]
pub fn device_pairing_host(app:AppHandle,state:State<'_,DevicePairing>)->Result<PairStatus,String>{
 let ip=local_ip()?;
 let listener=TcpListener::bind("0.0.0.0:0").map_err(|_|"No se pudo abrir la conexión local")?;
 listener.set_nonblocking(true).map_err(|_|"No se pudo iniciar la conexión")?;
 let port=listener.local_addr().map_err(|_|"No se pudo obtener el puerto")?.port();
 let code=format!("{:06}",OsRng.gen_range(0..1_000_000u32));
 let shared=state.inner().clone();
 let (generation,status)={let mut inner=shared.0.lock().map_err(|_|"Conexión ocupada")?;reset(&mut inner);inner.status=PairStatus{phase:"waiting".into(),code:Some(code.clone()),address:Some(SocketAddrV4::new(ip,port).to_string()),peer:None,message:None};(inner.generation,inner.status.clone())};
 thread::spawn(move||{
  let expiry=Instant::now()+Duration::from_secs(120);
  loop {
   if shared.0.lock().map(|i|i.generation!=generation).unwrap_or(true){return}
   if Instant::now()>=expiry{fail(&shared,generation,"El código venció. Generá uno nuevo.");return}
   match listener.accept(){
    Ok((stream,addr))=>{
     if !matches!(addr,SocketAddr::V4(v) if private_ip(*v.ip())){
      if let Ok(mut inner)=shared.0.lock(){if inner.generation==generation{
       inner.status.message=Some(format!("Se rechazó una conexión desde {addr}: su dirección no figura como red local privada."));
      }}
      continue
     }
     // Each code permits one attempt, including failed or stalled handshakes.
     update(&shared,generation,PairStatus{phase:"connecting".into(),message:Some("Verificando el código…".into()),..Default::default()});
     match pairing_transport::pair(stream,Role::Host,&code){
      Ok(channel) if Instant::now()<expiry=>session(app,shared,generation,channel,Role::Host),
      Ok(_)=>fail(&shared,generation,"El código venció durante la vinculación. Generá uno nuevo."),
      Err(e)=>fail(&shared,generation,&format!("Falló la verificación entre equipos: {e}. Generá un código nuevo.")),
     }return
    },
    Err(e) if e.kind()==std::io::ErrorKind::WouldBlock=>thread::sleep(Duration::from_millis(100)),
    Err(_)=>{fail(&shared,generation,"Se interrumpió la espera de conexión.");return}
   }
  }
 });Ok(status)
}
#[tauri::command]
pub fn device_pairing_join(address:String,code:String,app:AppHandle,state:State<'_,DevicePairing>)->Result<(),String>{
 let addr:SocketAddrV4=address.trim().parse().map_err(|_|"Ingresá la dirección local y el puerto que muestra la otra PC")?;
 if !private_ip(*addr.ip())||addr.port()==0{return Err("Ingresá una dirección IPv4 de red local válida".into())}
 if code.len()!=6||!code.bytes().all(|b|b.is_ascii_digit()){return Err("El código debe tener seis números".into())}
 let shared=state.inner().clone();
 let generation={let mut inner=shared.0.lock().map_err(|_|"Conexión ocupada")?;reset(&mut inner);inner.status=PairStatus{phase:"connecting".into(),message:Some("Conectando…".into()),..Default::default()};inner.generation};
 thread::spawn(move||{
  match TcpStream::connect_timeout(&SocketAddr::V4(addr),Duration::from_secs(5)){
   Ok(stream)=>match pairing_transport::pair(stream,Role::Client,&code){
    Ok(channel)=>session(app,shared,generation,channel,Role::Client),
    Err(e)=>fail(&shared,generation,&format!("Falló la verificación entre equipos: {e}. Generá un código nuevo.")),
   },
   Err(e)=>fail(&shared,generation,&format!("No se pudo contactar a la otra PC: {e}. Revisá la dirección y la red local.")),
  }
 });Ok(())
}
