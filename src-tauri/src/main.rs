#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod startup;
mod startup_core;
mod hit_test;
mod release_core;
mod updates;
mod workspace;
mod applications;
mod assistant;
mod assistant_core;
mod application_intent;
mod application_registry;
mod system_status;
mod media;
mod shelf;
mod lyrics;
mod weather;
mod caps_lock;
mod audio_meter;
mod window_overlap;
use tauri::{Emitter, Manager, menu::{Menu, MenuItem}, tray::TrayIconBuilder};

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
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
        .manage(audio_meter::AudioMeter::default())
        .manage(startup::Startup::default())
        .manage(applications::Applications::default())
        .manage(assistant::Assistant::default())
        .manage(workspace::DropInbox::default())
        .manage(hit_test::HitRegions::default())
        .manage(updates::Updates::default())
        .invoke_handler(tauri::generate_handler![audio_meter::audio_meter_enabled, window_overlap::window_overlaps_notch, weather::weather_detect_location, weather::weather_search_city, weather::weather_forecast, lyrics::lyrics_lookup, shelf::shelf_list, shelf::shelf_remove, shelf::shelf_open, workspace::shelf_accept_drop, media::media_state, media::media_control, system_status::system_status, startup::startup_sync, startup::startup_set, assistant::chrome_profiles, assistant::shortcuts_list, assistant::shortcuts_run_button, assistant::shortcuts_save, assistant::shortcuts_remove, assistant::shortcuts_request, assistant::shortcuts_confirm, assistant::shortcuts_cancel, assistant::assistant_pick_folder, assistant::folders_search, assistant::folders_open, assistant::folders_cancel, quit_app, hit_test::desktop_hit_regions, updates::updates_check, updates::updates_download, updates::updates_install, applications::apps_list, applications::apps_request, applications::apps_confirm, applications::apps_cancel, applications::apps_add, applications::apps_update, applications::apps_remove, workspace::workspace_discard_drop])
        .setup(|app| {
            hit_test::start(app.handle().clone());
            caps_lock::start(app.handle().clone());
            audio_meter::start(app.handle().clone());
            let show = MenuItem::with_id(app, "show", "Mostrar Bimu", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Ajustes", true, None::<&str>)?;
            let center = MenuItem::with_id(app, "center", "Centrar en el borde", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "Ocultar", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Cerrar aplicación", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &settings, &center, &hide, &quit])?;
            TrayIconBuilder::with_id("companion-tray")
                .icon(app.default_window_icon().expect("missing bundled icon").clone())
                .tooltip("Bimu")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    let id = event.id.as_ref();
                    if id == "quit" { quit_app(app.clone()); return; }
                    if let Some(window) = app.get_webview_window("main") {
                        if id == "hide" { let _ = window.hide(); return; }
                        
                        let _ = window.show();
                        let _ = window.set_focus();
                        if matches!(id, "settings" | "center" | "show") {
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
                
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("No se pudo iniciar Bimu")
        .run(|_,_|{});
}
