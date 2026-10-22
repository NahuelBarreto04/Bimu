use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Clone, Deserialize, Serialize)]
pub struct ChatMessage { pub role: String, pub content: String }

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder().no_proxy().connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(180)).build().map_err(|e| e.to_string())
}
fn network_error(e: reqwest::Error) -> String {
    if e.is_timeout() { "Ollama tardó demasiado en responder. Volvé a intentarlo.".into() }
    else { "No se pudo conectar con Ollama. Comprobá que esté abierto en 127.0.0.1:11434.".into() }
}
async fn payload(response: reqwest::Response) -> Result<serde_json::Value,String> {
    let status=response.status();
    let value:serde_json::Value=response.json().await.map_err(|_| "Ollama devolvió una respuesta inválida.".to_string())?;
    if !status.is_success() { return Err(value["error"].as_str().unwrap_or("Ollama no pudo procesar la solicitud.").to_string()); }
    Ok(value)
}
#[tauri::command]
pub async fn ollama_models() -> Result<Vec<String>,String> {
    let response=client()?.get("http://127.0.0.1:11434/api/tags").timeout(Duration::from_secs(6))
        .send().await.map_err(network_error)?;
    let value=payload(response).await?;
    let models=value["models"].as_array().ok_or("Ollama devolvió una lista de modelos inválida.")?;
    Ok(models.iter().filter_map(|m| m["name"].as_str().map(str::to_string)).collect())
}
#[tauri::command]
pub async fn ollama_chat(model:String,messages:Vec<ChatMessage>) -> Result<String,String> {
    if model.trim().is_empty() { return Err("Elegí un modelo instalado.".into()); }
    if messages.is_empty() || messages.len()>40 { return Err("La conversación debe contener entre 1 y 40 mensajes.".into()); }
    if messages.iter().any(|m| !matches!(m.role.as_str(),"user"|"assistant") || m.content.len()>64000) {
        return Err("El mensaje es demasiado largo o tiene un formato inválido.".into());
    }
    let mut context=vec![ChatMessage{role:"system".into(),content:"Sos Bimu, un compañero de escritorio amable y práctico. Respondé en español salvo que el usuario pida otro idioma. No afirmes ejecutar acciones ni acceder a archivos o herramientas: por ahora solo podés conversar.".into()}];
    context.extend(messages);
    let response=client()?.post("http://127.0.0.1:11434/api/chat")
        .json(&serde_json::json!({"model":model,"messages":context,"stream":false}))
        .send().await.map_err(network_error)?;
    let value=payload(response).await?;
    let text=value["message"]["content"].as_str().filter(|s| !s.trim().is_empty()).ok_or("El modelo devolvió una respuesta vacía.")?;
    Ok(text.to_string())
}

use std::sync::Mutex;
use tauri::{ipc::Channel, State};
use tokio::sync::watch;

#[derive(Default)]
pub struct Requests { active: Option<(String,watch::Sender<bool>)>, pending_cancel: Option<String> }
#[derive(Default)]
pub struct StreamRequests(pub Mutex<Requests>);
#[derive(Clone,Serialize)]
#[serde(tag="type",rename_all="snake_case")]
pub enum StreamEvent { Delta {content:String} }
#[derive(Serialize)]
pub struct StreamResult { content:String, stopped:bool }

#[tauri::command]
pub fn ollama_cancel(request_id:String,state:State<'_,StreamRequests>) -> Result<(),String> {
    let mut requests=state.inner().0.lock().map_err(|_|"No se pudo detener la generación.")?;
    if let Some((id,tx))=&requests.active {
        if id==&request_id { let _=tx.send(true);return Ok(()); }
    }
    // A stop click can arrive before the start command has been scheduled.
    requests.pending_cancel=Some(request_id);
    Ok(())
}
fn stream_packet(line:&[u8]) -> Result<(String,bool),String> {
    let value:serde_json::Value=serde_json::from_slice(line).map_err(|_|"Ollama devolvió un fragmento inválido.".to_string())?;
    if let Some(error)=value["error"].as_str() {return Err(error.to_string());}
    Ok((value["message"]["content"].as_str().unwrap_or("").to_string(),value["done"].as_bool().unwrap_or(false)))
}
async fn generate_stream(model:String,messages:Vec<ChatMessage>,on_event:Channel<StreamEvent>,mut cancel:watch::Receiver<bool>) -> Result<StreamResult,String> {
    if *cancel.borrow() {return Ok(StreamResult{content:String::new(),stopped:true});}
    let mut context=vec![ChatMessage{role:"system".into(),content:"Sos Bimu, un compañero de escritorio amable y práctico. Respondé en español salvo que el usuario pida otro idioma. Por ahora solo podés conversar: no tenés acceso a archivos ni podés abrir aplicaciones o ejecutar acciones.".into()}];
    context.extend(messages);
    let client=client()?;
    let request=client.post("http://127.0.0.1:11434/api/chat")
        .json(&serde_json::json!({"model":model,"messages":context,"stream":true}));
    let mut response=tokio::select! {
        biased;
        _=cancel.changed()=>return Ok(StreamResult{content:String::new(),stopped:true}),
        result=request.send()=>result.map_err(network_error)?
    };
    if !response.status().is_success() {
        tokio::select! {
            biased;
            _=cancel.changed()=>return Ok(StreamResult{content:String::new(),stopped:true}),
            result=payload(response)=>{result?;return Err("Ollama rechazó la solicitud.".into());}
        }
    }
    let mut buffer=Vec::new();let mut content=String::new();
    loop {
        let chunk=tokio::select! {
            biased;
            _=cancel.changed()=>return Ok(StreamResult{content,stopped:true}),
            result=response.chunk()=>result.map_err(network_error)?
        };
        if let Some(chunk)=chunk {buffer.extend_from_slice(&chunk);} else {
            if !buffer.is_empty() {
                let (text,done)=stream_packet(&buffer)?;
                if !text.is_empty(){content.push_str(&text);on_event.send(StreamEvent::Delta{content:text}).map_err(|_|"Se cerró el chat.")?;}
                if done{return Ok(StreamResult{content,stopped:false});}
            }
            return Err("La respuesta se interrumpió antes de finalizar. Podés volver a intentarlo.".into());
        }
        if buffer.len()>2*1024*1024{return Err("Ollama devolvió un fragmento demasiado grande.".into());}
        while let Some(pos)=buffer.iter().position(|b|*b==b'\n') {
            let line:Vec<u8>=buffer.drain(..=pos).collect();
            if line.iter().all(u8::is_ascii_whitespace){continue;}
            let (text,done)=stream_packet(&line)?;
            if !text.is_empty(){
                content.push_str(&text);
                on_event.send(StreamEvent::Delta{content:text}).map_err(|_|"Se cerró el chat.")?;
            }
            if content.len()>2*1024*1024{return Err("La respuesta superó el tamaño permitido.".into());}
            if done {
                if content.trim().is_empty(){return Err("El modelo devolvió una respuesta vacía.".into());}
                return Ok(StreamResult{content,stopped:false});
            }
        }
    }
}
#[tauri::command]
pub async fn ollama_chat_stream(request_id:String,model:String,messages:Vec<ChatMessage>,on_event:Channel<StreamEvent>,state:State<'_,StreamRequests>) -> Result<StreamResult,String> {
    if request_id.is_empty()||request_id.len()>100||model.trim().is_empty(){return Err("La solicitud o el modelo no son válidos.".into());}
    if messages.is_empty()||messages.len()>40||messages.iter().any(|m|!matches!(m.role.as_str(),"user"|"assistant")||m.content.len()>64000){return Err("El contexto de la conversación no es válido.".into());}
    let (tx,rx)=watch::channel(false);
    {
        let mut requests=state.inner().0.lock().map_err(|_|"No se pudo iniciar la generación.")?;
        if requests.pending_cancel.as_deref()==Some(request_id.as_str()){requests.pending_cancel=None;return Ok(StreamResult{content:String::new(),stopped:true});}
        if requests.active.is_some(){return Err("Todavía hay una respuesta en curso.".into());}
        requests.active=Some((request_id.clone(),tx));
    }
    let result=generate_stream(model,messages,on_event,rx).await;
    if let Ok(mut requests)=state.inner().0.lock(){if requests.active.as_ref().map(|(id,_)|id)==Some(&request_id){requests.active=None;}}
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn reads_content_and_completion(){assert_eq!(stream_packet(br#"{"message":{"content":"Hola"},"done":false}"#).unwrap(),("Hola".into(),false));assert_eq!(stream_packet(br#"{"done":true}"#).unwrap(),("".into(),true));}
    #[test] fn rejects_error_packet(){assert!(stream_packet(br#"{"error":"model not found"}"#).unwrap_err().contains("model not found"));}
    #[test] fn reads_utf8_after_chunk_reassembly(){let bytes="{\"message\":{\"content\":\"¡Hola!\"}}".as_bytes();let split=bytes.iter().position(|b|*b==0xc2).unwrap()+1;let mut buffer=bytes[..split].to_vec();buffer.extend_from_slice(&bytes[split..]);assert_eq!(stream_packet(&buffer).unwrap().0,"¡Hola!");}
}
