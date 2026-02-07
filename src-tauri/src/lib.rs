use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
mod commands;
mod utils;
use commands::server::ServerState;
#[cfg(target_os = "windows")]
use tauri_plugin_prevent_default::PlatformOptions;
use tokio::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default().setup(|app| {
        let win_builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
            .title("WebGAL Craft")
            .min_inner_size(620.0, 540.0)
            .inner_size(1280.0, 800.0)
            .center()
            .additional_browser_args("---force_high_performance_gpu");

        #[cfg(not(target_os = "macos"))]
        let win_builder = win_builder.decorations(false).transparent(true);

        #[cfg(target_os = "macos")]
        let win_builder = win_builder
            .hidden_title(true)
            .title_bar_style(tauri::TitleBarStyle::Overlay);

        let _window = win_builder.build().unwrap();

        #[cfg(debug_assertions)]
        _window.open_devtools();

        app.manage(Mutex::new(ServerState::default()));

        Ok(())
    });

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                let _ = app
                    .get_webview_window("main")
                    .expect("no main window")
                    .set_focus();
            }))
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_window_state::Builder::new().build());
    }

    let prevent_default_plugin = tauri_plugin_prevent_default::Builder::new()
        .with_flags(tauri_plugin_prevent_default::Flags::debug());

    #[cfg(target_os = "windows")]
    let prevent_default_plugin = prevent_default_plugin.platform(
        PlatformOptions::new()
            .general_autofill(false)
            .password_autosave(false),
    );

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Webview,
                ))
                .level(log::LevelFilter::Debug)
                .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
                .filter(|metadata| {
                    metadata.target() != "tao::platform_impl::platform::event_loop::runner"
                })
                .build(),
        )
        .plugin(prevent_default_plugin.build())
        .invoke_handler(tauri::generate_handler![
            // game
            commands::game::get_game_config,
            commands::game::set_game_config,
            // server
            commands::server::start_server,
            commands::server::add_static_site,
            commands::server::remove_static_site,
            commands::server::broadcast_message,
            commands::server::unicast_message,
            commands::server::get_connected_clients,
            // thumbnail
            commands::thumbnail::get_thumbnail,
            commands::thumbnail::clear_thumbnail_cache,
            // fs
            commands::fs::copy_directory,
            commands::fs::copy_directory_with_progress,
            commands::fs::validate_directory_structure,
            commands::fs::delete_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
