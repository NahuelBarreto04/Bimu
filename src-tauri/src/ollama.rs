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
