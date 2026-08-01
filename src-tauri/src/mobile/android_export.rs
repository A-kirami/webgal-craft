use std::path::PathBuf;

use serde_json::{json, Value};
use tauri::{plugin::Builder, AppHandle, Runtime};

#[cfg(target_os = "android")]
use tauri::{plugin::mobile::PluginHandle, Manager};

#[cfg(target_os = "android")]
const ANDROID_PLUGIN_IDENTIFIER: &str = "com.akirami.webgalcraft";

pub fn init<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    Builder::new("android-export")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let handle =
                    api.register_android_plugin(ANDROID_PLUGIN_IDENTIFIER, "AndroidExportPlugin")?;
                app.manage(AndroidExportPlugin(handle));
            }
            #[cfg(not(target_os = "android"))]
            {
                let _ = (app, api);
            }
            Ok(())
        })
        .build()
}

#[cfg(target_os = "android")]
pub(crate) struct AndroidExportPlugin<R: Runtime>(PluginHandle<R>);

#[cfg(target_os = "android")]
pub async fn invoke<R: Runtime>(
    app: &AppHandle<R>,
    command: &str,
    payload: Value,
) -> Result<Value, Value> {
    app.state::<AndroidExportPlugin<R>>()
        .0
        .run_mobile_plugin_async(command, payload)
        .await
        .map_err(|error| super::plugin_error_to_value(error, "Android export failed"))
}

#[cfg(not(target_os = "android"))]
pub async fn invoke<R: Runtime>(
    _app: &AppHandle<R>,
    _command: &str,
    _payload: Value,
) -> Result<Value, Value> {
    Err(json!({
        "code": "TAURI_ERROR",
        "message": "Android export is unavailable on this platform",
    }))
}

pub async fn resolve_staging<R: Runtime>(
    app: &AppHandle<R>,
    export_session_id: &str,
) -> Result<PathBuf, String> {
    let result = invoke(
        app,
        "resolveWebExportStaging",
        json!({ "exportSessionId": export_session_id }),
    )
    .await
    .map_err(|error| error.to_string())?;
    let path = result
        .get("sessionPath")
        .and_then(Value::as_str)
        .ok_or_else(|| "Android export staging path is missing".to_owned())?;
    Ok(PathBuf::from(path))
}

pub async fn cleanup_staging<R: Runtime>(
    app: &AppHandle<R>,
    export_session_id: &str,
) -> Result<(), String> {
    invoke(
        app,
        "cleanupWebExport",
        json!({ "exportSessionId": export_session_id }),
    )
    .await
    .map(|_| ())
    .map_err(|error| error.to_string())
}
