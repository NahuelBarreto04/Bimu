use serde::{Serialize,Deserialize};
use std::{path::PathBuf,process::{Child,Command,Stdio},sync::Mutex,time::Duration};
use tauri::{Manager,State,Emitter};
#[derive(Clone,Copy,Serialize,Deserialize,PartialEq,Debug)]
#[serde(rename_all="lowercase")]
pub enum Mode{Cpu,Gpu}
impl Mode{fn label(self)->&'static str{if self==Self::Gpu{"gpu"}else{"cpu"}}}
#[derive(Default)]struct Processes{server:Option<Child>,setup:Option<Child>,mode:Option<Mode>}
#[derive(Default)]pub struct VoiceEngine{processes:Mutex<Processes>,operation:tokio::sync::Mutex<()>}
impl VoiceEngine{
 pub fn shutdown(&self){if let Ok(mut p)=self.processes.lock(){if let Some(mut c)=p.server.take(){let _=c.kill();let _=c.wait();}if let Some(mut c)=p.setup.take(){let _=c.kill();let _=c.wait();}}}
}
impl Drop for VoiceEngine{fn drop(&mut self){self.shutdown()}}
#[derive(Serialize)]#[serde(rename_all="camelCase")]
pub struct EngineInfo{mode:Mode,cpu_installed:bool,gpu_installed:bool,running:bool,auto_start:bool}
#[derive(Serialize,Deserialize)]#[serde(rename_all="camelCase")]
struct Settings{mode:Mode,auto_start:bool}
fn root()->Result<PathBuf,String>{std::env::var_os("LOCALAPPDATA").map(|p|PathBuf::from(p).join("Bimu").join("voice")).ok_or("No se encontro LOCALAPPDATA.".into())}
fn runtime(mode:Mode)->Result<PathBuf,String>{Ok(root()?.join(if mode==Mode::Gpu{"whisper-v1.9.2-cuda-12.4"}else{"whisper-v1.9.2"}))}
fn executable(mode:Mode)->Result<PathBuf,String>{
 fn find(dir:&std::path::Path,depth:u8)->Option<PathBuf>{if depth>3{return None}for e in std::fs::read_dir(dir).ok()?.flatten(){let p=e.path();if p.file_name().and_then(|s|s.to_str())==Some("whisper-server.exe"){return Some(p)}if p.is_dir(){if let Some(p)=find(&p,depth+1){return Some(p)}}}None}
 find(&runtime(mode)?,0).ok_or("Prepara el motor desde Ajustes antes de iniciarlo.".into())
}
fn settings()->Result<Settings,String>{let path=root()?.join("engine-settings.json");Ok(std::fs::read(path).ok().and_then(|b|serde_json::from_slice(&b).ok()).unwrap_or(Settings{mode:if executable(Mode::Gpu).is_ok(){Mode::Gpu}else{Mode::Cpu},auto_start:true}))}
fn save(s:&Settings)->Result<(),String>{let dir=root()?;std::fs::create_dir_all(&dir).map_err(|e|e.to_string())?;std::fs::write(dir.join("engine-settings.json"),serde_json::to_vec(s).map_err(|e|e.to_string())?).map_err(|e|e.to_string())}
fn command(exe:impl AsRef<std::ffi::OsStr>)->Command{let mut c=Command::new(exe);#[cfg(windows)]{use std::os::windows::process::CommandExt;c.creation_flags(0x08000000);}c}
fn info(state:&VoiceEngine)->Result<EngineInfo,String>{let s=settings()?;let mut p=state.processes.lock().map_err(|_|"Motor ocupado.")?;let running=if let Some(c)=p.server.as_mut(){c.try_wait().map_err(|e|e.to_string())?.is_none()}else{false};if !running{p.server=None;p.mode=None}Ok(EngineInfo{mode:s.mode,cpu_installed:executable(Mode::Cpu).is_ok(),gpu_installed:executable(Mode::Gpu).is_ok(),running,auto_start:s.auto_start})}
async fn healthy()->bool{let Ok(c)=reqwest::Client::builder().no_proxy().timeout(Duration::from_secs(1)).build()else{return false};match c.get("http://127.0.0.1:8081/health").send().await{Ok(r)=>r.status().is_success()&&r.json::<serde_json::Value>().await.ok().map(|v|v["status"]=="ok").unwrap_or(false),Err(_)=>false}}
pub async fn ensure(state:&VoiceEngine)->Result<(),String>{
 let _guard=state.operation.lock().await;
 if healthy().await{return Ok(())}
 let s=settings()?;
 start_locked(state,s.mode).await
}
async fn start_locked(state:&VoiceEngine,mode:Mode)->Result<(),String>{
 #[cfg(not(windows))]return Err("El motor administrado requiere Windows x64.".into());
 #[cfg(windows)]{
  let exe=executable(mode)?;let model=root()?.join("models/ggml-base.bin");if !model.is_file(){return Err("Falta el modelo de voz. Prepara el motor desde Ajustes.".into())}
  {let mut p=state.processes.lock().map_err(|_|"Motor ocupado.")?;if let Some(mut c)=p.server.take(){let _=c.kill();let _=c.wait();}p.mode=None;}
  // An external server is never killed or claimed as owned by Bimu.
  if std::net::TcpStream::connect_timeout(&"127.0.0.1:8081".parse().unwrap(),Duration::from_millis(300)).is_ok(){return Err("El puerto 8081 esta ocupado. Detene una vez el Whisper de la terminal y volve a iniciar desde Bimu.".into())}
  let log=std::fs::File::create(root()?.join("engine.log")).map_err(|e|e.to_string())?;
  let mut c=command(&exe);c.current_dir(exe.parent().unwrap()).args(["-m"]).arg(&model).args(["--host","127.0.0.1","--port","8081","-l","es","-t","4"]);
  if mode==Mode::Cpu{c.arg("-ng");}
  let child=c.stdout(Stdio::from(log.try_clone().map_err(|e|e.to_string())?)).stderr(Stdio::from(log)).spawn().map_err(|e|format!("No se pudo iniciar Whisper: {e}"))?;
  {let mut p=state.processes.lock().map_err(|_|"Motor ocupado.")?;p.server=Some(child);p.mode=Some(mode);}
  for _ in 0..90{
   if healthy().await{return Ok(())}
   let alive={let mut p=state.processes.lock().map_err(|_|"Motor ocupado.")?;p.server.as_mut().map(|c|c.try_wait().ok().flatten().is_none()).unwrap_or(false)};
   if !alive{return Err("Whisper no pudo iniciar. Revisa el registro del motor; proba CPU si CUDA falla.".into())}
   tokio::time::sleep(Duration::from_millis(500)).await;
  }
  state.shutdown();Err("Whisper no estuvo listo a tiempo. Revisa el registro del motor.".into())
 }
}
#[tauri::command]pub fn voice_engine_status(state:State<'_,VoiceEngine>)->Result<EngineInfo,String>{info(&state)}
#[tauri::command]pub async fn voice_engine_start(mode:Option<Mode>,state:State<'_,VoiceEngine>)->Result<EngineInfo,String>{let _guard=state.operation.lock().await;let mut s=settings()?;let selected=mode.unwrap_or(s.mode);if info(&state)?.running&&s.mode==selected{return info(&state)}start_locked(&state,selected).await?;s.mode=selected;save(&s)?;info(&state)}
#[tauri::command]pub async fn voice_engine_stop(app:tauri::AppHandle,state:State<'_,VoiceEngine>)->Result<EngineInfo,String>{let _guard=state.operation.lock().await;let _=app.emit("bimu-voice-cancel",());state.shutdown();info(&state)}
#[tauri::command]pub fn voice_engine_auto(enabled:bool,state:State<'_,VoiceEngine>)->Result<EngineInfo,String>{let mut s=settings()?;s.auto_start=enabled;save(&s)?;info(&state)}
#[tauri::command]pub async fn voice_engine_prepare(mode:Mode,state:State<'_,VoiceEngine>)->Result<EngineInfo,String>{
 let _guard=state.operation.lock().await;
 #[cfg(not(windows))]return Err("El preparador requiere Windows x64.".into());
 #[cfg(windows)]{
  let dir=root()?;std::fs::create_dir_all(&dir).map_err(|e|e.to_string())?;
  let script=dir.join("managed-setup.ps1");std::fs::write(&script,include_str!("../../scripts/setup-voice.ps1")).map_err(|e|e.to_string())?;
  let log=std::fs::File::create(dir.join("setup.log")).map_err(|e|e.to_string())?;
  let child=command("powershell.exe").args(["-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File"]).arg(&script).args(["-Mode",mode.label()]).stdout(Stdio::from(log.try_clone().map_err(|e|e.to_string())?)).stderr(Stdio::from(log)).spawn().map_err(|e|e.to_string())?;
  state.processes.lock().map_err(|_|"Motor ocupado.")?.setup=Some(child);
  loop{
   let status={let mut p=state.processes.lock().map_err(|_|"Motor ocupado.")?;match p.setup.as_mut(){Some(c)=>c.try_wait().map_err(|e|e.to_string())?,None=>return Err("Preparacion cancelada.".into())}};
   if let Some(status)=status{state.processes.lock().map_err(|_|"Motor ocupado.")?.setup=None;if !status.success(){return Err("No se pudo preparar Whisper. Revisa el registro de preparacion y la conexion.".into())}break}
   tokio::time::sleep(Duration::from_millis(300)).await;
  }
  start_locked(&state,mode).await?;let mut s=settings()?;s.mode=mode;save(&s)?;info(&state)
 }
}
#[tauri::command]pub fn voice_engine_log(setup:bool)->Result<String,String>{let path=root()?.join(if setup{"setup.log"}else{"engine.log"});let bytes=std::fs::read(path).map_err(|_|"Todavia no hay registro.")?;let start=bytes.len().saturating_sub(16000);Ok(String::from_utf8_lossy(&bytes[start..]).into_owned())}
pub fn autostart(app:tauri::AppHandle){tauri::async_runtime::spawn(async move{if let Ok(s)=settings(){if s.auto_start&&executable(s.mode).is_ok(){let state=app.state::<VoiceEngine>();if let Err(e)=ensure(&state).await{let _=app.emit("voice-engine-error",e);}}}});}
