pub mod android_export;
pub mod managed_directory_import;

#[cfg(target_os = "android")]
pub(super) fn plugin_error_to_value(
    error: tauri::plugin::mobile::PluginInvokeError,
    fallback_message: &str,
) -> serde_json::Value {
    use serde_json::json;
    use tauri::plugin::mobile::PluginInvokeError;

    match error {
        PluginInvokeError::InvokeRejected(response) => json!({
            "code": response.code.unwrap_or_else(|| "UNKNOWN".to_owned()),
            "message": response.message.unwrap_or_else(|| fallback_message.to_owned()),
        }),
        error => json!({ "code": "TAURI_ERROR", "message": error.to_string() }),
    }
}
