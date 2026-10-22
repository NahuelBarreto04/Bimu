#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod ollama;
use tauri::{Emitter, Manager, menu::{Menu, MenuItem}, tray::TrayIconBuilder};

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

fn main() {
    tauri::Builder::default()
        .manage(ollama::StreamRequests::default())
        .invoke_handler(tauri::generate_handler![quit_app, ollama::ollama_models, ollama::ollama_chat, ollama::ollama_chat_stream, ollama::ollama_cancel])
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Mostrar mascota", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Personalizar", true, None::<&str>)?;
            let greet = MenuItem::with_id(app, "greet", "Saludar", true, None::<&str>)?;
            let rest = MenuItem::with_id(app, "rest", "Descansar", true, None::<&str>)?;
            let center = MenuItem::with_id(app, "center", "Centrar en el borde", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "Ocultar", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Cerrar aplicación", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &settings, &greet, &rest, &center, &hide, &quit])?;
            TrayIconBuilder::with_id("companion-tray")
                .icon(app.default_window_icon().expect("missing bundled icon").clone())
                .tooltip("Mi pequeño compañero")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    let id = event.id.as_ref();
                    if id == "quit" { quit_app(app.clone()); return; }
                    if let Some(window) = app.get_webview_window("main") {
                        if id == "hide" { let _ = window.hide(); return; }
                        
                        let _ = window.show();
                        let _ = window.set_focus();
                        if matches!(id, "settings" | "greet" | "rest" | "center" | "show") {
                            let _ = window.emit("desktop-action", id);
                        }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("No se pudo iniciar la mascota");
}
