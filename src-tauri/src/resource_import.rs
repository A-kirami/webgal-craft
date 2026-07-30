use serde_json::{json, Value};
use tauri::{
    ipc::Channel,
    plugin::{Builder, TauriPlugin},
    AppHandle, Runtime,
};

#[cfg(target_os = "android")]
use tauri::{plugin::{mobile::PluginInvokeError, PluginHandle}, Manager};

#[cfg(target_os = "android")]
const ANDROID_PLUGIN_IDENTIFIER: &str = "com.akirami.webgalcraft";

pub fn init<R: Runtime>() -> TauriPlugin<R> {
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
pub(crate) struct ResourceImportPlugin<R: Runtime>(pub PluginHandle<R>);

#[tauri::command]
pub async fn android_resource_import_resolve_roots<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Value, Value> {
    run_android_plugin(&app, "resolveResourceRoots", json!({})).await
}

#[tauri::command]
pub async fn android_resource_import_select_and_stage<R: Runtime>(
    app: AppHandle<R>,
    kind: String,
    operation: Option<Value>,
    on_progress: Channel<Value>,
) -> Result<Value, Value> {
    run_android_plugin(
        &app,
        "selectAndStage",
        json!({ "kind": kind, "operation": operation, "onProgress": on_progress }),
    )
    .await
}

#[tauri::command]
pub async fn android_resource_import_publish<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
    final_relative_path: String,
) -> Result<Value, Value> {
    run_android_plugin(
        &app,
        "publish",
        json!({ "sessionId": session_id, "finalRelativePath": final_relative_path }),
    )
    .await
}

#[tauri::command]
pub async fn android_resource_import_commit<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
    resource_id: String,
) -> Result<Value, Value> {
    run_android_plugin(
        &app,
        "commit",
        json!({ "sessionId": session_id, "resourceId": resource_id }),
    )
    .await
}

#[tauri::command]
pub async fn android_resource_import_rollback<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
) -> Result<Value, Value> {
    run_android_plugin(&app, "rollback", json!({ "sessionId": session_id })).await
}

#[tauri::command]
pub async fn android_resource_import_cancel<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
) -> Result<Value, Value> {
    run_android_plugin(&app, "cancel", json!({ "sessionId": session_id })).await
}

#[tauri::command]
pub async fn android_resource_import_list_recoverable_sessions<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Value, Value> {
    run_android_plugin(&app, "listRecoverableSessions", json!({})).await
}

#[cfg(target_os = "android")]
async fn run_android_plugin<R: Runtime>(
    app: &AppHandle<R>,
    command: &str,
    payload: Value,
) -> Result<Value, Value> {
    app.state::<ResourceImportPlugin<R>>()
        .0
        .run_mobile_plugin_async(command, payload)
        .await
        .map_err(mobile_error_to_value)
}

#[cfg(target_os = "android")]
fn mobile_error_to_value(error: PluginInvokeError) -> Value {
    match error {
        PluginInvokeError::InvokeRejected(response) => json!({
            "code": response.code.unwrap_or_else(|| "UNKNOWN".to_owned()),
            "message": response.message.unwrap_or_else(|| "Android resource import failed".to_owned()),
        }),
        error => json!({ "code": "TAURI_ERROR", "message": error.to_string() }),
    }
}

#[cfg(not(target_os = "android"))]
async fn run_android_plugin<R: Runtime>(
    _app: &AppHandle<R>,
    _command: &str,
    _payload: Value,
) -> Result<Value, Value> {
    Err(json!({
        "code": "TAURI_ERROR",
        "message": "Android resource import is unavailable on this platform",
    }))
}
