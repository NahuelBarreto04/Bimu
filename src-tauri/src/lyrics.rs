use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
struct Candidate { track_name: String, artist_name: String, duration: f64, instrumental: bool, synced_lyrics: Option<String> }
#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct LyricsResult { status: &'static str, synced_lyrics: Option<String> }
fn normalized(s: &str) -> String { s.to_lowercase().chars().filter(|c| c.is_alphanumeric()).collect() }

#[tauri::command]
pub async fn lyrics_lookup(title: String, artist: String, duration: f64) -> Result<LyricsResult, String> {
    if title.trim().is_empty() || artist.trim().is_empty() || title.len()>500 || artist.len()>500 || !duration.is_finite() { return Err("Faltan datos de la canción.".into()) }
    let client=reqwest::Client::builder().timeout(Duration::from_secs(12)).user_agent("Bimu/0.30.0 (https://github.com/marianoarias1/Bimu)").build().map_err(|e|e.to_string())?;
    let response=client.get("https://lrclib.net/api/search").query(&[("track_name",title.as_str()),("artist_name",artist.as_str())]).send().await.map_err(|_|"No se pudo conectar con LRCLIB.".to_string())?;
    if !response.status().is_success(){return Err("LRCLIB no está disponible en este momento.".into())}
    if response.content_length().unwrap_or(0)>1_000_000{return Err("La respuesta de letras es demasiado grande.".into())}
    let bytes=response.bytes().await.map_err(|_|"No se pudo leer la respuesta de letras.")?;
    if bytes.len()>1_000_000{return Err("La respuesta de letras es demasiado grande.".into())}
    let candidates:Vec<Candidate>=serde_json::from_slice(&bytes).map_err(|_|"La respuesta de letras no es válida.")?;
    let selected=candidates.into_iter().filter(|v|normalized(&v.track_name)==normalized(&title)&&normalized(&v.artist_name)==normalized(&artist)&&(duration<=0.0||(v.duration-duration).abs()<=5.0)).min_by(|a,b|(a.duration-duration).abs().total_cmp(&(b.duration-duration).abs()));
    Ok(match selected {Some(v) if v.instrumental=>LyricsResult{status:"instrumental",synced_lyrics:None},Some(v) if v.synced_lyrics.as_ref().is_some_and(|s|!s.trim().is_empty())=>LyricsResult{status:"synced",synced_lyrics:v.synced_lyrics},_=>LyricsResult{status:"missing",synced_lyrics:None}})
}
