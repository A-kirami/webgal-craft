fn main() {
    if std::env::var_os("CARGO_FEATURE_DESKTOP").is_none() {
        return;
    }
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["exit_game", "set_window_fullscreen"]),
    ))
    .expect("game runtime build configuration must be valid");
}
