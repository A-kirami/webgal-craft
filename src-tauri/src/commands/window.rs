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

fn resolve_window_target(target: &str) -> AppResult<WebviewUrl> {
    if target.contains("://") {
        let url =
            Url::parse(target).map_err(|error| AppError::Window(format!("无效的 URL: {error}")))?;
        return match url.scheme() {
            "http" | "https" => Ok(WebviewUrl::External(url)),
            scheme => Err(AppError::Window(format!("不支持的 URL 协议: {scheme}"))),
        };
    }

    let route = if target.starts_with('/') {
        target.to_string()
    } else {
        format!("/{}", target)
    };
    Ok(WebviewUrl::App(route.into()))
}

#[tauri::command]
pub async fn create_window(app_handle: AppHandle, options: CreateWindowOptions) -> AppResult<bool> {
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

    let webview_url = resolve_window_target(&target)?;

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

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use tauri::WebviewUrl;

    use super::{resolve_window_target, AppError, CreateWindowOptions};

    #[test]
    fn create_window_options_deserializes_camel_case_fields() {
        let options: CreateWindowOptions = serde_json::from_value(serde_json::json!({
            "label": "preview",
            "target": "editor",
            "title": "Preview",
            "width": 960.0,
            "height": 540.0,
            "minWidth": 480.0,
            "minHeight": 320.0,
            "resizable": false,
            "center": true,
            "reuse": true,
            "useCustomTitleBar": true
        }))
        .expect("window options should deserialize");

        assert_eq!(options.label, "preview");
        assert_eq!(options.target, "editor");
        assert_eq!(options.title.as_deref(), Some("Preview"));
        assert_eq!(options.width, Some(960.0));
        assert_eq!(options.height, Some(540.0));
        assert_eq!(options.min_width, Some(480.0));
        assert_eq!(options.min_height, Some(320.0));
        assert_eq!(options.resizable, Some(false));
        assert_eq!(options.center, Some(true));
        assert_eq!(options.reuse, Some(true));
        assert_eq!(options.use_custom_title_bar, Some(true));
    }

    #[test]
    fn resolve_window_target_supports_external_http_and_https_urls() {
        let resolved = resolve_window_target("https://example.com/preview")
            .expect("https target should be supported");

        let WebviewUrl::External(url) = resolved else {
            panic!("expected external webview url");
        };

        assert_eq!(url.as_str(), "https://example.com/preview");
    }

    #[test]
    fn resolve_window_target_normalizes_internal_routes() {
        let resolved =
            resolve_window_target("editor").expect("internal route should be normalized");

        let WebviewUrl::App(route) = resolved else {
            panic!("expected app webview url");
        };

        assert_eq!(route, PathBuf::from("/editor"));
    }

    #[test]
    fn resolve_window_target_preserves_existing_rooted_internal_routes() {
        let resolved =
            resolve_window_target("/editor").expect("rooted internal route should be preserved");

        let WebviewUrl::App(route) = resolved else {
            panic!("expected app webview url");
        };

        assert_eq!(route, PathBuf::from("/editor"));
    }

    #[test]
    fn resolve_window_target_rejects_invalid_or_unsupported_external_targets() {
        let invalid_url = resolve_window_target("https://exa mple.com")
            .expect_err("invalid external url should be rejected");
        let unsupported_scheme = resolve_window_target("file:///tmp/preview")
            .expect_err("unsupported scheme should be rejected");

        assert!(matches!(
            invalid_url,
            AppError::Window(message) if message.contains("无效的 URL")
        ));
        assert!(matches!(
            unsupported_scheme,
            AppError::Window(message) if message.contains("不支持的 URL 协议")
        ));
    }
}
