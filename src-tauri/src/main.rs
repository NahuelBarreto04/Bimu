#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod startup;
mod autonomy;
mod file_search;
mod autonomy_core;
mod startup_core;
mod ollama;
mod hit_test;
mod voice_engine;
mod release_core;
mod updates;
mod workspace;
mod voice;
mod applications;
mod assistant;
mod assistant_core;
mod documents;
mod workspace_core;
mod application_intent;
mod application_registry;
mod system_status;
mod media;
mod shelf;
use tauri::{Emitter, Manager, menu::{Menu, MenuItem}, tray::TrayIconBuilder};

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.state::<voice_engine::VoiceEngine>().shutdown();
    app.exit(0);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app,args,_cwd|{
            if args.iter().any(|arg|arg=="--autostart"){return}
            if let Some(window)=app.get_webview_window("main"){let _=window.show();let _=window.set_focus();let _=window.emit("desktop-action","show");}
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(shelf::Shelf::default())
        .manage(startup::Startup::default())
        .manage(autonomy::Autonomy::default())
        .manage(applications::Applications::default())
        .manage(assistant::Assistant::default())
        .manage(workspace::Workspace::default())
        .manage(workspace::DropInbox::default())
        .manage(ollama::StreamRequests::default())
        .manage(voice::VoiceState::default())
        .manage(hit_test::HitRegions::default())
        .manage(voice_engine::VoiceEngine::default())
        .manage(updates::Updates::default())
        .invoke_handler(tauri::generate_handler![shelf::shelf_list, shelf::shelf_remove, shelf::shelf_open, workspace::shelf_accept_drop, media::media_state, media::media_control, system_status::system_status, autonomy::autonomy_reset, autonomy::autonomy_confirm, autonomy::autonomy_cancel, startup::startup_sync, startup::startup_set, assistant::chrome_profiles, assistant::shortcuts_list, assistant::shortcuts_save, assistant::shortcuts_remove, assistant::shortcuts_request, assistant::shortcuts_confirm, assistant::shortcuts_cancel, assistant::assistant_pick_folder, assistant::folders_search, assistant::folders_open, assistant::folders_cancel, quit_app, hit_test::desktop_hit_regions, voice_engine::voice_engine_status, voice_engine::voice_engine_start, voice_engine::voice_engine_stop, voice_engine::voice_engine_prepare, voice_engine::voice_engine_auto, voice_engine::voice_engine_log, updates::updates_check, updates::updates_download, updates::updates_install, applications::apps_list, applications::apps_request, applications::apps_confirm, applications::apps_cancel, applications::apps_add, applications::apps_update, applications::apps_remove, workspace::workspace_choose_files, workspace::workspace_remove_file, voice::voice_status, voice::voice_transcribe, voice::voice_cancel, ollama::ollama_models, ollama::ollama_chat, ollama::ollama_chat_stream, ollama::ollama_cancel, ollama::ollama_capabilities, workspace::workspace_choose, workspace::workspace_revoke, workspace::workspace_stage_drop, workspace::workspace_accept_drop, workspace::workspace_discard_drop])
        .setup(|app| {
            hit_test::start(app.handle().clone());
            voice_engine::autostart(app.handle().clone());
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
                        if id == "hide" { let _=window.emit("bimu-voice-cancel",());let _ = window.hide(); return; }
                        
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
            if let tauri::WindowEvent::DragDrop(drag)=event {workspace::handle_drag(window,drag);}
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _=window.emit("bimu-voice-cancel",());
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("No se pudo iniciar Bimu")
        .run(|app,event|{if let tauri::RunEvent::Exit=event{app.state::<voice_engine::VoiceEngine>().shutdown();}});
}
