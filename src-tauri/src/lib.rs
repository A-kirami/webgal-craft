use tauri::Manager;
mod commands;
mod vfs;
mod window;
use commands::server::ServerState;
use commands::vfs::OverlayFactoryCache;
#[cfg(target_os = "windows")]
use tauri_plugin_prevent_default::PlatformOptions;
use tokio::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default().setup(|app| {
        let app_handle = app.handle();
        let _window = window::create_main(app_handle, "WebGAL Craft")?;

        #[cfg(debug_assertions)]
        _window.open_devtools();

        app.manage(OverlayFactoryCache::default());
        app.manage(Mutex::new(ServerState::new()));

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
            // engine
            commands::engine::read_engine_manifest,
            // project config
            commands::project_config::read_project_config_cmd,
            commands::project_config::write_project_config_cmd,
            // vfs
            commands::vfs::resolve_vfs_path,
            commands::vfs::list_vfs_dir,
            commands::vfs::ensure_vfs_writable,
            commands::vfs::delete_vfs_path,
            commands::vfs::rename_vfs_path,
            commands::vfs::move_vfs_path,
            commands::vfs::copy_vfs_path,
            commands::vfs::is_template_dirty,
            commands::vfs::clean_template_upper,
            // backup
            commands::backup::create_backup,
            commands::backup::list_backups,
            commands::backup::read_backup,
            commands::backup::restore_backup,
            commands::backup::cleanup_backups,
            commands::backup::move_backup_history,
            // server
            commands::server::start_server,
            commands::server::add_static_site,
            commands::server::update_site_engine,
            commands::server::update_site_template,
            commands::server::broadcast_message,
            commands::server::unicast_message,
            commands::server::get_connected_clients,
            // fs
            commands::fs::copy_directory,
            commands::fs::copy_directory_with_progress,
            commands::fs::validate_directory_structure,
            commands::fs::delete_file,
            commands::fs::rename_file,
            commands::fs::is_binary_file,
            commands::fs::get_image_dimensions,
            // window
            commands::window::create_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
