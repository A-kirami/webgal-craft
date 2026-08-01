use serde_json::{json, Value};
use tauri::{ipc::Channel, AppHandle, Runtime};

use crate::mobile::managed_directory_import;

#[tauri::command]
pub async fn android_resource_import_resolve_roots<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Value, Value> {
    managed_directory_import::invoke(&app, "resolveResourceRoots", json!({})).await
}

#[tauri::command]
pub async fn android_resource_import_select_and_stage<R: Runtime>(
    app: AppHandle<R>,
    kind: String,
    operation: Option<Value>,
    on_progress: Channel<Value>,
) -> Result<Value, Value> {
    managed_directory_import::invoke(
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
    managed_directory_import::invoke(
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
    managed_directory_import::invoke(
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
    managed_directory_import::invoke(&app, "rollback", json!({ "sessionId": session_id })).await
}

#[tauri::command]
pub async fn android_resource_import_cancel<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
) -> Result<Value, Value> {
    managed_directory_import::invoke(&app, "cancel", json!({ "sessionId": session_id })).await
}

#[tauri::command]
pub async fn android_resource_import_list_recoverable_sessions<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Value, Value> {
    managed_directory_import::invoke(&app, "listRecoverableSessions", json!({})).await
}
