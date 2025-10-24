#[cfg(not(target_os = "macos"))]
pub fn create(
    handle: &tauri::AppHandle,
    label: &state::WindowLabelRef,
    window_relative_url: String,
) -> tauri::Result<tauri::WebviewWindow> {
    tracing::info!("creating window '{label}' created at '{window_relative_url}'");
    let window = tauri::WebviewWindowBuilder::new(
        handle,
        label,
        tauri::WebviewUrl::App(window_relative_url.into()),
    )
    .resizable(true)
    .title(handle.package_info().name.clone())
    .disable_drag_drop_handler()
    .min_inner_size(1000.0, 600.0)
    .inner_size(1160.0, 720.0)
    .build()?;
    Ok(window)
}

#[cfg(target_os = "macos")]
pub fn create(
    handle: &tauri::AppHandle,
    label: &state::WindowLabelRef,
    window_relative_url: String,
) -> tauri::Result<tauri::WebviewWindow> {
    tracing::info!("creating window '{label}' created at '{window_relative_url}'");
    let window = tauri::WebviewWindowBuilder::new(
        handle,
        label,
        tauri::WebviewUrl::App(window_relative_url.into()),
    )
    .resizable(true)
    .title(handle.package_info().name.clone())
    .disable_drag_drop_handler()
    .min_inner_size(1000.0, 600.0)
    .inner_size(1160.0, 720.0)
    .hidden_title(true)
    .title_bar_style(tauri::TitleBarStyle::Overlay)
    .build()?;
    Ok(window)
}
