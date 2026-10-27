use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaState {
    title: String,
    artist: String,
    playing: bool,
    position: f64,
    duration: f64,
    cover: Option<String>,
}

#[cfg(windows)]
async fn current() -> windows::core::Result<windows::Media::Control::GlobalSystemMediaTransportControlsSession> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager;
    GlobalSystemMediaTransportControlsSessionManager::RequestAsync()?.await?.GetCurrentSession()
}

#[tauri::command]
pub async fn media_state(include_cover: bool) -> Result<Option<MediaState>, String> {
    tauri::async_runtime::spawn_blocking(move || tauri::async_runtime::block_on(media_state_inner(include_cover)))
        .await.map_err(|e| e.to_string())?
}

async fn media_state_inner(include_cover: bool) -> Result<Option<MediaState>, String> {
    #[cfg(windows)] {
        use base64::{engine::general_purpose::STANDARD, Engine};
        use windows::{Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus, Storage::Streams::DataReader};
        let session = match current().await { Ok(v) => v, Err(_) => return Ok(None) };
        let props = session.TryGetMediaPropertiesAsync().map_err(|e| e.to_string())?.await.map_err(|e| e.to_string())?;
        let title = props.Title().map(|v| v.to_string_lossy()).unwrap_or_default();
        if title.is_empty() { return Ok(None) }
        let artist = props.Artist().map(|v| v.to_string_lossy()).unwrap_or_default();
        let playing = session.GetPlaybackInfo().and_then(|v| v.PlaybackStatus()).map(|v| v == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing).unwrap_or(false);
        let (position,duration) = session.GetTimelineProperties().map(|v| (v.Position().map(|x| x.Duration as f64/10_000_000.0).unwrap_or(0.0), v.EndTime().map(|x| x.Duration as f64/10_000_000.0).unwrap_or(0.0))).unwrap_or((0.0,0.0));
        let cover = if include_cover { if let Ok(reference) = props.Thumbnail() {
            if let Ok(op) = reference.OpenReadAsync() {
                if let Ok(stream) = op.await {
                    let size = stream.Size().unwrap_or(0);
                    if size > 0 && size <= 2_000_000 {
                        if let Ok(reader) = DataReader::CreateDataReader(&stream) {
                            if let Ok(load) = reader.LoadAsync(size as u32) {
                                if load.await.is_ok() {
                                    let mut bytes = vec![0u8; size as usize];
                                    if reader.ReadBytes(&mut bytes).is_ok() { Some(format!("data:image/jpeg;base64,{}", STANDARD.encode(bytes))) } else { None }
                                } else { None }
                            } else { None }
                        } else { None }
                    } else { None }
                } else { None }
            } else { None }
        } else { None } } else { None };
        return Ok(Some(MediaState { title, artist, playing, position, duration, cover }))
    }
    #[cfg(not(windows))] { let _ = include_cover; Ok(None) }
}

#[tauri::command]
pub async fn media_control(action: String) -> Result<(), String> {
    #[cfg(windows)] {
        let session = current().await.map_err(|e| e.to_string())?;
        let request = match action.as_str() {
            "toggle" => session.TryTogglePlayPauseAsync(),
            "previous" => session.TrySkipPreviousAsync(),
            "next" => session.TrySkipNextAsync(),
            _ => return Err("Acción multimedia desconocida".into()),
        }.map_err(|e| e.to_string())?;
        return if request.await.map_err(|e| e.to_string())? { Ok(()) } else { Err("El reproductor no pudo realizar la acción".into()) }
    }
    #[cfg(not(windows))] { let _ = action; Err("Disponible en Windows".into()) }
}
