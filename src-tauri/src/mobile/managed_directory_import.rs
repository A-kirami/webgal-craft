use serde_json::Value;
use tauri::{plugin::Builder, AppHandle, Runtime};

#[cfg(target_os = "android")]
use tauri::{plugin::PluginHandle, Manager};

#[cfg(not(target_os = "android"))]
use serde_json::json;

#[cfg(target_os = "android")]
const ANDROID_PLUGIN_IDENTIFIER: &str = "com.akirami.webgalcraft";

pub fn init<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    Builder::new("resource-import")
        .setup(|app, api| {
            #[cfg(target_os = "android")]
            {
                let handle =
                    api.register_android_plugin(ANDROID_PLUGIN_IDENTIFIER, "ResourceImportPlugin")?;
                app.manage(ResourceImportPlugin(handle));
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
pub(crate) struct ResourceImportPlugin<R: Runtime>(PluginHandle<R>);

#[cfg(target_os = "android")]
pub async fn invoke<R: Runtime>(
    app: &AppHandle<R>,
    command: &str,
    payload: Value,
) -> Result<Value, Value> {
    app.state::<ResourceImportPlugin<R>>()
        .0
        .run_mobile_plugin_async(command, payload)
        .await
        .map_err(|error| super::plugin_error_to_value(error, "Android resource import failed"))
}

#[cfg(not(target_os = "android"))]
pub async fn invoke<R: Runtime>(
    _app: &AppHandle<R>,
    _command: &str,
    _payload: Value,
) -> Result<Value, Value> {
    Err(json!({
        "code": "TAURI_ERROR",
        "message": "Android resource import is unavailable on this platform",
    }))
}
