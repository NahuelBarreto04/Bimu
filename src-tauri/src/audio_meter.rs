use std::sync::{Arc,atomic::{AtomicBool,Ordering}};
use tauri::State;
#[derive(Default,Clone)]
pub struct AudioMeter(Arc<AtomicBool>);
#[tauri::command]
pub fn audio_meter_enabled(enabled:bool,state:State<'_,AudioMeter>){state.0.store(enabled,Ordering::Relaxed)}
pub fn start(app:tauri::AppHandle){
 #[cfg(windows)] std::thread::spawn(move||{
  use tauri::{Emitter,Manager};
  use windows::Win32::{System::Com::{CoCreateInstance,CoInitializeEx,CoUninitialize,CLSCTX_ALL,CLSCTX_INPROC_SERVER,COINIT_MULTITHREADED},Media::Audio::{IMMDeviceEnumerator,MMDeviceEnumerator,eRender,eMultimedia,Endpoints::IAudioMeterInformation}};
  let enabled=app.state::<AudioMeter>().inner().clone();
  unsafe {if CoInitializeEx(None,COINIT_MULTITHREADED).is_err(){return}}
  let enumerator:windows::core::Result<IMMDeviceEnumerator>=unsafe{CoCreateInstance(&MMDeviceEnumerator,None,CLSCTX_INPROC_SERVER)};
  let Ok(enumerator)=enumerator else{unsafe{CoUninitialize()};return};
  let mut meter:Option<IAudioMeterInformation>=None;let mut next_refresh=std::time::Instant::now();
  while app.get_webview_window("main").is_some(){
   if !enabled.0.load(Ordering::Relaxed){meter=None;std::thread::sleep(std::time::Duration::from_millis(200));continue}
   if meter.is_none()||std::time::Instant::now()>=next_refresh {
    meter=unsafe{enumerator.GetDefaultAudioEndpoint(eRender,eMultimedia).and_then(|device|device.Activate::<IAudioMeterInformation>(CLSCTX_ALL,None)).ok()};
    next_refresh=std::time::Instant::now()+std::time::Duration::from_secs(5);
   }
   if let Some(ref current)=meter {match unsafe{current.GetPeakValue()} {Ok(v)=>{let _=app.emit("audio-output-peak",v.clamp(0.,1.));},Err(_)=>meter=None}}
   std::thread::sleep(std::time::Duration::from_millis(80));
  }
  drop(meter);drop(enumerator);unsafe{CoUninitialize()};
 });
 #[cfg(not(windows))] let _=app;
}
