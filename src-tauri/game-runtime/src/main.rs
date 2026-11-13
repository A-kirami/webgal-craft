#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{error::Error, fs};

use tauri::{webview::NewWindowResponse, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_opener::OpenerExt;
use webgal_game_runtime::{GameConfig, CONFIG_FILE, RESOURCE_DIRECTORY};

#[tauri::command]
fn exit_game(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn set_window_fullscreen(window: tauri::WebviewWindow, active: bool) -> Result<(), String> {
    window
        .set_fullscreen(active)
        .map_err(|error| error.to_string())
}

fn open_external(app: &tauri::AppHandle, url: &tauri::Url) {
    if matches!(url.scheme(), "http" | "https") {
        if let Err(error) = app.opener().open_url(url.as_str(), None::<String>) {
            eprintln!("Cannot open external link: {error}");
        }
    }
}

fn is_game_resource_url(url: &tauri::Url) -> bool {
    url.port().is_none()
        && ((url.scheme() == "asset" && url.host_str() == Some("localhost"))
            || (url.scheme() == "https" && url.host_str() == Some("asset.localhost")))
}

fn run() -> Result<(), Box<dyn Error>> {
    let executable = std::env::current_exe()?;
    let root = executable.parent().expect("executable has a parent");
    let config: GameConfig = serde_json::from_slice(&fs::read(root.join(CONFIG_FILE))?)?;
    config.validate()?;
    let resources = root.join(RESOURCE_DIRECTORY).canonicalize()?;
    let index = resources.join("index.html");
    let file_url = tauri::Url::from_file_path(&index).map_err(|_| "invalid game resource path")?;
    #[cfg(target_os = "windows")]
    let asset_path = file_url.path().trim_start_matches('/');
    #[cfg(not(target_os = "windows"))]
    let asset_path = file_url.path();
    let url: tauri::Url = format!("asset://localhost/{asset_path}").parse()?;
    let mut context = tauri::generate_context!();
    context.config_mut().identifier = config.application_id();
    context.set_default_window_icon(None);
    let icon = resources.join("icon.png");
    if icon.is_file() {
        context.set_default_window_icon(Some(tauri::image::Image::from_path(icon)?));
    }
    let bridge = include_str!("../window-bridge.js").replace(
        "__WEBGAL_INITIAL_FULLSCREEN__",
        if config.full_screen { "true" } else { "false" },
    );
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::Builder::new().open_js_links_on_click(false).build())
        .invoke_handler(tauri::generate_handler![exit_game, set_window_fullscreen])
        .setup(move |app| {
            app.asset_protocol_scope().allow_directory(&resources, true)?;
            let data_directory = app.path().app_local_data_dir()?.join("webview");
            fs::create_dir_all(&data_directory)?;
            let handle = app.handle().clone();
            let navigation_handle = handle.clone();
            let builder = WebviewWindowBuilder::new(app, "game", WebviewUrl::External(url))
                .title(&config.title)
                .inner_size(config.width.into(), config.height.into())
                .min_inner_size(config.min_width.into(), config.min_height.into())
                .fullscreen(config.full_screen)
                .resizable(config.resizable)
                .data_directory(data_directory)
                .use_https_scheme(true)
                .initialization_script(bridge)
                .on_new_window(move |url, _| {
                    open_external(&handle, &url);
                    NewWindowResponse::Deny
                })
                .on_navigation(move |url| {
                    if is_game_resource_url(url) {
                        return true;
                    }
                    open_external(&navigation_handle, url);
                    false
                });
            #[cfg(target_os = "macos")]
            let builder = {
                use sha2::{Digest, Sha256};
                let hash = Sha256::digest(config.game_key.as_bytes());
                builder.data_store_identifier(hash[..16].try_into()?)
            };
            let window = builder.build()?;
            let event_window = window.clone();
            window.on_window_event(move |event| {
                if matches!(event, WindowEvent::Resized(_) | WindowEvent::Focused(_)) {
                    if let Ok(active) = event_window.is_fullscreen() {
                        if let Err(error) = event_window.eval(format!(
                            "window.dispatchEvent(new CustomEvent('webgal:window-fullscreen', {{detail:{active}}}));"
                        )) {
                            eprintln!("Cannot synchronize fullscreen state: {error}");
                        }
                    }
                }
            });
            Ok(())
        })
        .run(context)?;
    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("Cannot start game: {error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::is_game_resource_url;

    #[test]
    fn only_game_resource_origin_can_navigate_inside_the_window() {
        for url in [
            "asset://localhost/index.html",
            "https://asset.localhost/index.html",
        ] {
            assert!(is_game_resource_url(&url.parse().unwrap()));
        }
        for url in [
            "https://example.com/",
            "https://asset.localhost.example.com/",
            "https://asset.localhost:1234/index.html",
            "http://asset.localhost/index.html",
            "file:///tmp/index.html",
            "javascript:alert(1)",
            "asset://other/index.html",
        ] {
            assert!(!is_game_resource_url(&url.parse().unwrap()));
        }
    }
}
