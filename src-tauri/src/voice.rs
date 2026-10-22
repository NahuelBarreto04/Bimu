use std::{sync::Mutex,time::Duration};
use tauri::State;
use tokio::sync::watch;
use serde_json::Value;
const BASE:&str="http://127.0.0.1:8081";
const MAX_AUDIO:usize=44+16000*30*2;
#[derive(Default)]
pub struct VoiceState(pub Mutex<Requests>);
#[derive(Default)]
pub struct Requests{active:Option<(String,watch::Sender<bool>)>,pending:Option<String>}
fn client()->Result<reqwest::Client,String>{reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).connect_timeout(Duration::from_secs(3)).timeout(Duration::from_secs(180)).build().map_err(|_|"No se pudo iniciar la transcripción local.".into())}
#[tauri::command]
pub async fn voice_status()->Result<(),String>{
    let response=client()?.get(format!("{BASE}/health")).timeout(Duration::from_secs(4)).send().await.map_err(|_|"No se encuentra Whisper local. Iniciá whisper-server en 127.0.0.1:8081 (Ajustes → Voz).")?;
    if response.status().as_u16()==503{return Err("Whisper todavía está cargando el modelo. Esperá y volvé a comprobar.".into());}
    if !response.status().is_success(){return Err("El motor de voz local no está disponible.".into());}
    let status:Value=response.json().await.map_err(|_|"El servicio local no respondió como whisper.cpp.")?;
    if status["status"]!="ok"{return Err("El motor local todavía no está listo.".into());}Ok(())
}
fn validate_wav(audio:&[u8])->Result<(),String>{
    if audio.len()<44+9600||audio.len()>MAX_AUDIO{return Err("El audio debe durar entre 0,3 y 30 segundos.".into());}
    if &audio[0..4]!=b"RIFF"||&audio[8..12]!=b"WAVE"||&audio[12..16]!=b"fmt "||&audio[36..40]!=b"data"{return Err("Formato de audio inválido.".into());}
    let u16_at=|i|u16::from_le_bytes([audio[i],audio[i+1]]);
    let u32_at=|i|u32::from_le_bytes([audio[i],audio[i+1],audio[i+2],audio[i+3]]);
    if u32_at(4) as usize!=audio.len()-8||u32_at(16)!=16||u16_at(20)!=1||u16_at(22)!=1||u32_at(24)!=16000||u32_at(28)!=32000||u16_at(32)!=2||u16_at(34)!=16||u32_at(40) as usize!=audio.len()-44||(audio.len()-44)%2!=0{return Err("Se requiere WAV PCM mono de 16 kHz y 16 bits.".into());}Ok(())
}
async fn transcribe(audio:Vec<u8>,mut cancel:watch::Receiver<bool>)->Result<String,String>{
    if *cancel.borrow(){return Err("Transcripción cancelada.".into());}
    let part=reqwest::multipart::Part::bytes(audio).file_name("bimu-voice.wav").mime_str("audio/wav").map_err(|_|"No se pudo preparar el audio.")?;
    let form=reqwest::multipart::Form::new().part("file",part).text("response_format","json").text("language","es").text("translate","false").text("temperature","0.0");
    let request=client()?.post(format!("{BASE}/inference")).multipart(form).send();
    let mut response=tokio::select!{biased;_=cancel.changed()=>return Err("Transcripción cancelada.".into()),r=request=>r.map_err(|_|"Falló la transcripción local. Comprobá Whisper e intentá una frase más corta.")?};
    if !response.status().is_success(){return Err(format!("Whisper no pudo procesar el audio ({}).",response.status().as_u16()));}
    let mut bytes=Vec::new();
    loop{
        let chunk=tokio::select!{biased;_=cancel.changed()=>return Err("Transcripción cancelada.".into()),r=response.chunk()=>r.map_err(|_|"Se interrumpió la transcripción local.")?};
        match chunk{Some(chunk)=>{if bytes.len()+chunk.len()>131072{return Err("La transcripción es demasiado larga.".into());}bytes.extend_from_slice(&chunk)},None=>break}
    }
    let data:Value=serde_json::from_slice(&bytes).map_err(|_|"Whisper devolvió una respuesta inválida.")?;
    let text=data["text"].as_str().unwrap_or("").trim();
    if text.is_empty(){return Err("No se reconocieron palabras. Probá hablar más cerca del micrófono.".into());}
    if text.chars().count()>16000||text.len()>64000{return Err("La transcripción supera el tamaño del mensaje.".into());}Ok(text.into())
}
#[tauri::command]
pub async fn voice_transcribe(request_id:String,audio:Vec<u8>,state:State<'_,VoiceState>)->Result<String,String>{
    if request_id.is_empty()||request_id.len()>100{return Err("Solicitud de voz inválida.".into());}validate_wav(&audio)?;
    let(tx,rx)=watch::channel(false);
    {let mut requests=state.inner().0.lock().map_err(|_|"No se pudo iniciar la transcripción.")?;
        if requests.pending.as_deref()==Some(request_id.as_str()){requests.pending=None;return Err("Transcripción cancelada.".into());}
        if requests.active.is_some(){return Err("Todavía hay una transcripción en curso.".into());}requests.active=Some((request_id.clone(),tx));}
    let result=transcribe(audio,rx).await;
    if let Ok(mut requests)=state.inner().0.lock(){if requests.active.as_ref().map(|(id,_)|id)==Some(&request_id){requests.active=None;}}
    result
}
#[tauri::command]
pub fn voice_cancel(request_id:String,state:State<'_,VoiceState>)->Result<(),String>{
    if request_id.is_empty()||request_id.len()>100{return Err("Solicitud de voz inválida.".into());}
    let mut requests=state.inner().0.lock().map_err(|_|"No se pudo cancelar la transcripción.")?;
    if let Some((id,tx))=&requests.active{if id==&request_id{let _=tx.send(true);}}else{requests.pending=Some(request_id);}Ok(())
}
#[cfg(test)]mod tests{
    use super::*;
    fn wav()->Vec<u8>{let mut b=vec![0;44+32000];b[0..4].copy_from_slice(b"RIFF");b[4..8].copy_from_slice(&32036u32.to_le_bytes());b[8..12].copy_from_slice(b"WAVE");b[12..16].copy_from_slice(b"fmt ");b[16..20].copy_from_slice(&16u32.to_le_bytes());b[20..22].copy_from_slice(&1u16.to_le_bytes());b[22..24].copy_from_slice(&1u16.to_le_bytes());b[24..28].copy_from_slice(&16000u32.to_le_bytes());b[28..32].copy_from_slice(&32000u32.to_le_bytes());b[32..34].copy_from_slice(&2u16.to_le_bytes());b[34..36].copy_from_slice(&16u16.to_le_bytes());b[36..40].copy_from_slice(b"data");b[40..44].copy_from_slice(&32000u32.to_le_bytes());b}
    #[test]fn validates_audio_contract(){assert!(validate_wav(&wav()).is_ok());assert!(validate_wav(&[]).is_err());let mut b=wav();b[22]=2;assert!(validate_wav(&b).is_err());let mut b=wav();b[40]=0;assert!(validate_wav(&b).is_ok());b[40]=1;assert!(validate_wav(&b).is_err());assert!(validate_wav(&vec![0;MAX_AUDIO+1]).is_err());}
}
