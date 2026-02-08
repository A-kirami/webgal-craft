use serde::Deserialize;
use tauri::{AppHandle, Manager, WebviewUrl};

use super::{AppError, AppResult};
use crate::window::WindowConfig;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWindowOptions {
    label: String,
    route: String,
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
    let route = if options.route.starts_with('/') {
        options.route
    } else {
        format!("/{}", options.route)
    };

    if let Some(window) = app_handle.get_webview_window(&options.label) {
        if options.reuse.unwrap_or(false) {
            window.show()?;
            window.set_focus()?;
            return Ok(false);
        }
        return Err(AppError::Config("窗口已存在".into()));
    }

    let mut config = WindowConfig::new(options.label.clone(), WebviewUrl::App(route.into()));

    if let Some(title) = options.title {
        config = config.title(title);
    }

    if let (Some(width), Some(height)) = (options.min_width, options.min_height) {
        config = config.min_size(width, height);
    }

    if let (Some(width), Some(height)) = (options.width, options.height) {
        config = config.size(width, height);
    }

    if let Some(resizable) = options.resizable {
        config = config.resizable(resizable);
    }

    if let Some(center) = options.center {
        config = config.center(center);
    }

    if let Some(use_custom_title_bar) = options.use_custom_title_bar {
        config = config.use_custom_title_bar(use_custom_title_bar);
    }

    config.build(&app_handle)?;

    Ok(true)
}
