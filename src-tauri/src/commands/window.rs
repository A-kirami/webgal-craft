use serde::Deserialize;
use tauri::{AppHandle, Manager, Url, WebviewUrl};

use super::{AppError, AppResult};
use crate::window::WindowConfig;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWindowOptions {
    label: String,
    target: String,
    title: Option<String>,
    width: Option<f64>,
    height: Option<f64>,
    min_width: Option<f64>,
    min_height: Option<f64>,
    resizable: Option<bool>,
    center: Option<bool>,
    reuse: Option<bool>,
    use_custom_title_bar: Option<bool>,
}

#[tauri::command]
pub async fn create_window(
    app_handle: AppHandle,
    options: CreateWindowOptions,
) -> AppResult<bool> {
    let CreateWindowOptions {
        label,
        target,
        title,
        width,
        height,
        min_width,
        min_height,
        resizable,
        center,
        reuse,
        use_custom_title_bar,
    } = options;

    if let Some(window) = app_handle.get_webview_window(&label) {
        if reuse.unwrap_or(false) {
            if window.is_minimized()? {
                window.unminimize()?;
            }
            window.show()?;
            window.set_focus()?;
            return Ok(false);
        }
        return Ok(false);
    }

    let webview_url = if target.starts_with("http://") || target.starts_with("https://") {
        let url = Url::parse(&target)
            .map_err(|error| AppError::Window(format!("无效的 URL: {error}")))?;
        WebviewUrl::External(url)
    } else {
        let route = if target.starts_with('/') {
            target
        } else {
            format!("/{}", target)
        };
        WebviewUrl::App(route.into())
    };

    let mut config = WindowConfig::new(label, webview_url);

    if let Some(title) = title {
        config = config.title(title);
    }

    if let (Some(width), Some(height)) = (min_width, min_height) {
        config = config.min_size(width, height);
    }

    if let (Some(width), Some(height)) = (width, height) {
        config = config.size(width, height);
    }

    if let Some(resizable) = resizable {
        config = config.resizable(resizable);
    }

    if let Some(center) = center {
        config = config.center(center);
    }

    if let Some(use_custom_title_bar) = use_custom_title_bar {
        config = config.use_custom_title_bar(use_custom_title_bar);
    }

    config.build(&app_handle)?;

    Ok(true)
}
