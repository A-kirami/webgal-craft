mod preview_sync;

use std::{
    collections::HashMap,
    hash::{Hash, Hasher},
    io::Cursor,
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
};

use axum::{
    body::Body,
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        ConnectInfo, Path as AxumPath, State as AxumState,
    },
    http::{
        header::{
            ACCESS_CONTROL_ALLOW_ORIGIN, CACHE_CONTROL, CONTENT_TYPE, ORIGIN, RANGE,
            SEC_WEBSOCKET_PROTOCOL, VARY,
        },
        HeaderMap, HeaderValue, Request, StatusCode, Uri,
    },
    response::{IntoResponse, Redirect, Response},
    routing::get,
    Router,
};
use futures::{SinkExt, StreamExt};
use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, ImageFormat};
use portpicker::pick_unused_port;
use preview_sync::{
    build_empty_response, is_event_message, is_preview_command_request,
    parse_register_preview_request, requests_v1_subprotocol, PreviewSessionRegistry,
    RegisterPreviewRequestPayload, EDITOR_PREVIEW_PROTOCOL_V1_SUBPROTOCOL,
    SESSION_REGISTER_PREVIEW_TYPE,
};
use tauri::{ipc::Channel, State as TauriState};
use tokio::{
    net::TcpListener,
    sync::{mpsc, oneshot, Mutex, RwLock},
    task::JoinHandle,
};
use tower::util::ServiceExt;
use tower_http::services::ServeFile;

use crate::vfs::{
    resolve_default_template_path, sanitize_request_path, CachedCanonicals, OverlayFs, VfsError,
};

use super::{AppError, AppResult};

const STATIC_FILE_ALLOWED_CORS_ORIGINS: [&str; 4] = [
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "http://tauri.localhost",
    "tauri://localhost",
];

struct AppState {
    sites: RwLock<HashMap<String, CachedCanonicals>>,
    preview_clients: Mutex<HashMap<SocketAddr, mpsc::UnboundedSender<Message>>>,
    preview_registry: Mutex<PreviewSessionRegistry>,
    editor_event_channel: RwLock<Option<Channel<String>>>,
}

pub struct ServerState {
    app_state: Arc<AppState>,
    server_handle: Option<ServerHandle>,
}

struct ServerHandle {
    join_handle: JoinHandle<()>,
    shutdown_tx: oneshot::Sender<()>,
}

const MAX_THUMBNAIL_DIMENSION: u32 = 2048;
const JPEG_THUMBNAIL_QUALITY: u8 = 85;

impl ServerState {
    pub fn new() -> Self {
        Self {
            app_state: Arc::new(AppState {
                sites: RwLock::new(HashMap::new()),
                preview_clients: Mutex::new(HashMap::new()),
                preview_registry: Mutex::new(PreviewSessionRegistry::default()),
                editor_event_channel: RwLock::new(None),
            }),
            server_handle: None,
        }
    }
}

async fn send_message_to_preview(
    state: &Arc<AppState>,
    addr: SocketAddr,
    message: Message,
) -> AppResult<()> {
    let clients = state.preview_clients.lock().await;
    let Some(tx) = clients.get(&addr) else {
        return Err(AppError::Server("预览客户端不存在".into()));
    };

    tx.send(message)
        .map_err(|_| AppError::Server("发送预览消息失败".into()))
}

async fn forward_event_to_editor(state: &Arc<AppState>, message: String) {
    let editor_event_channel = state.editor_event_channel.read().await.clone();
    if let Some(editor_event_channel) = editor_event_channel {
        let _ = editor_event_channel.send(message);
    }
}

async fn handle_register_preview_request(
    state: &Arc<AppState>,
    addr: SocketAddr,
    request_id: String,
    payload: RegisterPreviewRequestPayload,
) {
    let accepted = {
        let mut preview_registry = state.preview_registry.lock().await;
        preview_registry.register(addr, payload)
    };

    if !accepted {
        let _ = send_message_to_preview(state, addr, Message::Close(None)).await;
        return;
    }

    let Ok(response) = build_empty_response(SESSION_REGISTER_PREVIEW_TYPE, &request_id) else {
        let _ = send_message_to_preview(state, addr, Message::Close(None)).await;
        return;
    };

    let _ = send_message_to_preview(state, addr, Message::Text(response.into())).await;
}

async fn handle_preview_socket_message(state: &Arc<AppState>, addr: SocketAddr, text: String) {
    if let Some((request_id, payload)) = parse_register_preview_request(&text) {
        handle_register_preview_request(state, addr, request_id, payload).await;
        return;
    }

    if !is_event_message(&text) {
        return;
    }

    let should_forward = {
        let preview_registry = state.preview_registry.lock().await;
        preview_registry.preferred_event_source() == Some(addr)
    };

    if should_forward {
        forward_event_to_editor(state, text).await;
    }
}

async fn cleanup_disconnected_preview(state: &Arc<AppState>, addr: SocketAddr) {
    state.preview_clients.lock().await.remove(&addr);
    state.preview_registry.lock().await.unregister(addr);
}

async fn handle_ws(
    ws: WebSocketUpgrade,
    headers: HeaderMap,
    AxumState(state): AxumState<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> impl IntoResponse {
    let requested_subprotocol = headers
        .get(SEC_WEBSOCKET_PROTOCOL)
        .and_then(|value| value.to_str().ok());
    if !requests_v1_subprotocol(requested_subprotocol) {
        return StatusCode::BAD_REQUEST.into_response();
    }

    ws.protocols([EDITOR_PREVIEW_PROTOCOL_V1_SUBPROTOCOL])
        .on_upgrade(move |socket| handle_ws_socket(socket, state, addr))
        .into_response()
}

async fn handle_ws_socket(socket: WebSocket, state: Arc<AppState>, addr: SocketAddr) {
    let (mut ws_tx, mut ws_rx) = socket.split();
    let (unicast_tx, mut unicast_rx) = mpsc::unbounded_channel();
    state.preview_clients.lock().await.insert(addr, unicast_tx);

    let mut recv_task = tokio::spawn({
        let state = state.clone();
        async move {
            while let Some(Ok(message)) = ws_rx.next().await {
                match message {
                    Message::Text(text) => {
                        handle_preview_socket_message(&state, addr, text.to_string()).await;
                    }
                    Message::Close(_) => break,
                    _ => continue,
                }
            }
        }
    });

    let mut send_task = tokio::spawn(async move {
        while let Some(message) = unicast_rx.recv().await {
            if ws_tx.send(message).await.is_err() {
                break;
            }
        }
    });

    tokio::select! {
        _ = &mut recv_task => {
            send_task.abort();
            let _ = send_task.await;
        },
        _ = &mut send_task => {
            recv_task.abort();
            let _ = recv_task.await;
        },
    }

    cleanup_disconnected_preview(&state, addr).await;
}

fn resolve_cors_origin(headers: &HeaderMap) -> Option<&'static str> {
    let origin = headers.get(ORIGIN)?.to_str().ok()?;
    STATIC_FILE_ALLOWED_CORS_ORIGINS
        .iter()
        .copied()
        .find(|allowed| *allowed == origin)
}

fn append_cors_headers(response: &mut Response, origin: Option<&'static str>) {
    if let Some(allowed_origin) = origin {
        response.headers_mut().insert(
            ACCESS_CONTROL_ALLOW_ORIGIN,
            HeaderValue::from_static(allowed_origin),
        );
    }

    response
        .headers_mut()
        .insert(VARY, HeaderValue::from_static("Origin"));
}

fn finalize_cors(mut response: Response, origin: Option<&'static str>) -> Response {
    append_cors_headers(&mut response, origin);
    response
}

async fn handle_static_request(
    AxumState(state): AxumState<Arc<AppState>>,
    AxumPath(hash): AxumPath<String>,
    uri: Uri,
    request_path: Option<String>,
    headers: HeaderMap,
) -> Response {
    let origin = resolve_cors_origin(&headers);
    let query = parse_static_asset_query(uri.query());

    let site = {
        let sites = state.sites.read().await;
        sites.get(&hash).cloned()
    };

    let Some(site) = site else {
        return finalize_cors(StatusCode::NOT_FOUND.into_response(), origin);
    };

    let logical_path = match sanitize_request_path(request_path.as_deref().unwrap_or("")) {
        Ok(path) => path,
        Err(error) => return finalize_cors(map_vfs_error(&error).into_response(), origin),
    };

    let overlay = OverlayFs::from_cached(&site);

    let physical_path =
        match tokio::task::spawn_blocking(move || overlay.resolve_file(&logical_path)).await {
            Ok(Ok(path)) => path,
            Ok(Err(error)) => return finalize_cors(map_vfs_error(&error).into_response(), origin),
            Err(_) => {
                return finalize_cors(StatusCode::INTERNAL_SERVER_ERROR.into_response(), origin)
            }
        };

    if let Some(thumbnail_request) = resolve_thumbnail_request(&query) {
        if let Some(response) =
            try_build_thumbnail_response(&physical_path, thumbnail_request).await
        {
            return finalize_cors(
                apply_cache_control(response, CacheControlPolicy::Thumbnail),
                origin,
            );
        }
    }

    let mut request_builder = Request::builder().uri("/");
    for header_name in [RANGE, ORIGIN] {
        if let Some(value) = headers.get(&header_name) {
            request_builder = request_builder.header(header_name, value);
        }
    }
    let request = request_builder
        .body(Body::empty())
        .expect("空请求构造不会失败");
    let response = ServeFile::new(&physical_path)
        .oneshot(request)
        .await
        .map(IntoResponse::into_response)
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());

    finalize_cors(
        apply_cache_control(response, CacheControlPolicy::StaticAsset),
        origin,
    )
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct StaticAssetQuery {
    width: Option<u32>,
    height: Option<u32>,
    resize_mode: Option<ThumbnailResizeMode>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
enum ThumbnailResizeMode {
    #[default]
    Contain,
    Cover,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ThumbnailRequest {
    width: u32,
    height: u32,
    resize_mode: ThumbnailResizeMode,
}

struct EncodedThumbnail {
    body: Vec<u8>,
    content_type: &'static str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CacheControlPolicy {
    StaticAsset,
    Thumbnail,
}

fn parse_static_asset_query(query: Option<&str>) -> StaticAssetQuery {
    let mut parsed = StaticAssetQuery::default();
    let Some(query) = query else {
        return parsed;
    };

    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        let Some(key) = parts.next() else {
            continue;
        };
        let Some(value) = parts.next() else {
            continue;
        };

        let decoded_value = urlencoding::decode(value).ok();
        let decoded_value = decoded_value.as_deref().unwrap_or(value);

        match key {
            "w" => parsed.width = decoded_value.parse().ok(),
            "h" => parsed.height = decoded_value.parse().ok(),
            "fit" if decoded_value.eq_ignore_ascii_case("contain") => {
                parsed.resize_mode = Some(ThumbnailResizeMode::Contain);
            }
            "fit" if decoded_value.eq_ignore_ascii_case("cover") => {
                parsed.resize_mode = Some(ThumbnailResizeMode::Cover);
            }
            _ => {}
        }
    }

    parsed
}

fn resolve_thumbnail_request(query: &StaticAssetQuery) -> Option<ThumbnailRequest> {
    let width = query.width?;
    let height = query.height?;

    if width == 0 || height == 0 {
        return None;
    }

    Some(ThumbnailRequest {
        width: width.min(MAX_THUMBNAIL_DIMENSION),
        height: height.min(MAX_THUMBNAIL_DIMENSION),
        resize_mode: query.resize_mode.unwrap_or_default(),
    })
}

async fn try_build_thumbnail_response(
    physical_path: &Path,
    thumbnail_request: ThumbnailRequest,
) -> Option<Response> {
    if !supports_thumbnail(physical_path) {
        return None;
    }

    let encoded_thumbnail = tokio::task::spawn_blocking({
        let path = physical_path.to_path_buf();
        move || build_thumbnail(&path, thumbnail_request)
    })
    .await
    .ok()??;

    let mut response = Response::new(encoded_thumbnail.body.into());
    response.headers_mut().insert(
        CONTENT_TYPE,
        HeaderValue::from_static(encoded_thumbnail.content_type),
    );
    Some(response)
}

fn supports_thumbnail(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "png" | "jpg" | "jpeg" | "gif" | "webp" | "ico"
            )
        })
}

fn build_thumbnail(path: &Path, request: ThumbnailRequest) -> Option<EncodedThumbnail> {
    let source = std::fs::read(path).ok()?;
    let image = image::load_from_memory(&source).ok()?;
    let thumbnail = match request.resize_mode {
        ThumbnailResizeMode::Contain => {
            image.resize(request.width, request.height, FilterType::Lanczos3)
        }
        ThumbnailResizeMode::Cover => {
            image.resize_to_fill(request.width, request.height, FilterType::Lanczos3)
        }
    };

    if thumbnail.color().has_alpha() {
        let mut cursor = Cursor::new(Vec::new());
        thumbnail.write_to(&mut cursor, ImageFormat::Png).ok()?;

        return Some(EncodedThumbnail {
            body: cursor.into_inner(),
            content_type: "image/png",
        });
    }

    let mut body = Vec::new();
    JpegEncoder::new_with_quality(&mut body, JPEG_THUMBNAIL_QUALITY)
        .encode_image(&thumbnail)
        .ok()?;

    Some(EncodedThumbnail {
        body,
        content_type: "image/jpeg",
    })
}

fn apply_cache_control(mut response: Response, policy: CacheControlPolicy) -> Response {
    let value = match policy {
        CacheControlPolicy::StaticAsset => "no-store, no-cache, must-revalidate, max-age=0",
        CacheControlPolicy::Thumbnail => "public, max-age=86400",
    };
    response
        .headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static(value));
    response
}

fn map_vfs_error(error: &VfsError) -> StatusCode {
    match error {
        VfsError::PathDenied | VfsError::WriteToEngineRuntime => StatusCode::FORBIDDEN,
        VfsError::NotFound => StatusCode::NOT_FOUND,
        VfsError::Io(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

#[cfg(debug_assertions)]
async fn timing_middleware(request: Request<Body>, next: axum::middleware::Next) -> Response {
    let path = request.uri().path().to_owned();
    let start = std::time::Instant::now();
    let response = next.run(request).await;
    let elapsed = start.elapsed();
    if elapsed > std::time::Duration::from_millis(10) {
        log::debug!("慢请求: {} - {:?}", path, elapsed);
    }
    response
}

#[tauri::command]
pub async fn start_server(
    state: TauriState<'_, Mutex<ServerState>>,
    host: String,
    port: u16,
    on_message: Channel<String>,
) -> AppResult<String> {
    let mut state_guard = state.lock().await;

    if let Some(handle) = state_guard.server_handle.take() {
        let _ = handle.shutdown_tx.send(());
        handle.join_handle.await.ok();
    }

    let address = format!("{host}:{port}");
    let listener = match TcpListener::bind(&address).await {
        Ok(listener) => listener,
        Err(_) => {
            let new_port =
                pick_unused_port().ok_or_else(|| AppError::Server("无法找到可用端口".into()))?;
            TcpListener::bind(format!("{host}:{new_port}")).await?
        }
    };

    let addr = listener.local_addr()?;
    log::info!("HTTP 服务器监听: {addr}");
    *state_guard.app_state.editor_event_channel.write().await = Some(on_message);

    let app = Router::new()
        .route("/api/webgalsync", get(handle_ws))
        .route("/game/{hash}", get(handle_redirect))
        .route(
            "/game/{hash}/",
            get(
                |state: AxumState<Arc<AppState>>,
                 hash: AxumPath<String>,
                 uri: Uri,
                 headers: HeaderMap| async move {
                    handle_static_request(state, hash, uri, None, headers).await
                },
            ),
        )
        .route(
            "/game/{hash}/{*path}",
            get(
                |state: AxumState<Arc<AppState>>,
                 path: AxumPath<(String, String)>,
                 uri: Uri,
                 headers: HeaderMap| async move {
                    let (hash, path) = path.0;
                    handle_static_request(state, AxumPath(hash), uri, Some(path), headers).await
                },
            ),
        )
        .with_state(state_guard.app_state.clone());

    #[cfg(debug_assertions)]
    let app = app.layer(axum::middleware::from_fn(timing_middleware));

    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let join_handle = tokio::spawn(async move {
        if let Err(e) = axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .with_graceful_shutdown(async {
            shutdown_rx.await.ok();
        })
        .await
        {
            log::error!("HTTP 服务器异常: {e}");
        }
    });

    state_guard.server_handle = Some(ServerHandle {
        join_handle,
        shutdown_tx,
    });

    Ok(format!("http://{addr}"))
}

async fn handle_redirect(uri: Uri) -> Result<Redirect, StatusCode> {
    Ok(Redirect::permanent(&format!("{}/", uri.path())))
}

fn normalize_project_path(path: &str) -> AppResult<(String, PathBuf)> {
    let path_buf = PathBuf::from(path);

    if !path_buf.exists() {
        return Err(AppError::Server("路径不存在".into()));
    }

    if !path_buf.is_dir() {
        return Err(AppError::Server("路径必须是目录".into()));
    }

    let canonical_path = path_buf
        .canonicalize()
        .map_err(|error| AppError::Server(format!("无法标准化路径: {error}")))?;

    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    canonical_path.hash(&mut hasher);
    let hash = format!("{:x}", hasher.finish());

    Ok((hash, path_buf))
}

fn validate_dir_path(path: Option<String>) -> AppResult<Option<PathBuf>> {
    let Some(path) = path else {
        return Ok(None);
    };
    let path_buf = PathBuf::from(path);
    if !path_buf.is_dir() {
        return Err(AppError::Server("路径必须是目录".into()));
    }
    Ok(Some(path_buf))
}

#[tauri::command]
pub async fn add_static_site(
    state: TauriState<'_, Mutex<ServerState>>,
    project_path: String,
    engine_path: Option<String>,
    template_path: Option<String>,
) -> AppResult<String> {
    let state_guard = state.lock().await;
    let (hash, project_path) = normalize_project_path(&project_path)?;
    let engine_path = validate_dir_path(engine_path)?;
    let template_path = validate_dir_path(template_path)?
        .or_else(|| resolve_default_template_path(engine_path.as_deref()))
        .filter(|path| path.is_dir());

    let cached_canonicals =
        CachedCanonicals::compute(project_path.clone(), engine_path, template_path)?;

    state_guard
        .app_state
        .sites
        .write()
        .await
        .insert(hash.clone(), cached_canonicals);

    log::debug!("注册站点: {hash} -> {}", project_path.display());
    Ok(hash)
}

#[tauri::command]
pub async fn update_site_engine(
    state: TauriState<'_, Mutex<ServerState>>,
    project_path: String,
    new_engine_path: Option<String>,
) -> AppResult<()> {
    let state_guard = state.lock().await;
    let (hash, _) = normalize_project_path(&project_path)?;
    let engine_path = validate_dir_path(new_engine_path)?;

    let mut sites = state_guard.app_state.sites.write().await;
    let Some(site) = sites.get_mut(&hash) else {
        log::warn!(
            "update_site_engine: 站点未注册 hash={hash} project={}",
            project_path
        );
        return Err(AppError::SiteNotRegistered);
    };

    // 若旧模板沿用的是旧引擎的内置默认值，则随引擎切换重新派生；用户显式指定的模板保持不变
    let prev_default_template = resolve_default_template_path(site.engine_lower.as_deref());
    let template_path = if site.template_lower == prev_default_template {
        resolve_default_template_path(engine_path.as_deref()).filter(|path| path.is_dir())
    } else {
        site.template_lower.clone()
    };

    *site = CachedCanonicals::compute(site.upper.clone(), engine_path, template_path)?;

    Ok(())
}

#[tauri::command]
pub async fn update_site_template(
    state: TauriState<'_, Mutex<ServerState>>,
    project_path: String,
    new_template_path: Option<String>,
) -> AppResult<()> {
    let state_guard = state.lock().await;
    let (hash, _) = normalize_project_path(&project_path)?;
    let template_path = validate_dir_path(new_template_path)?;

    let mut sites = state_guard.app_state.sites.write().await;
    let Some(site) = sites.get_mut(&hash) else {
        log::warn!(
            "update_site_template: 站点未注册 hash={hash} project={}",
            project_path
        );
        return Err(AppError::SiteNotRegistered);
    };

    *site =
        CachedCanonicals::compute(site.upper.clone(), site.engine_lower.clone(), template_path)?;

    Ok(())
}

#[tauri::command]
pub async fn set_active_preview_session(
    state: TauriState<'_, Mutex<ServerState>>,
    game_id: Option<String>,
) -> AppResult<()> {
    let app_state = {
        let state_guard = state.lock().await;
        state_guard.app_state.clone()
    };

    app_state
        .preview_registry
        .lock()
        .await
        .set_active_game_id(game_id);
    Ok(())
}

#[tauri::command]
pub async fn set_embedded_preview_launch_id(
    state: TauriState<'_, Mutex<ServerState>>,
    embedded_launch_id: Option<String>,
) -> AppResult<()> {
    let app_state = {
        let state_guard = state.lock().await;
        state_guard.app_state.clone()
    };

    app_state
        .preview_registry
        .lock()
        .await
        .set_embedded_launch_id(embedded_launch_id);
    Ok(())
}

#[tauri::command]
pub async fn send_preview_command(
    state: TauriState<'_, Mutex<ServerState>>,
    request: String,
) -> AppResult<()> {
    if !is_preview_command_request(&request) {
        return Err(AppError::Server("无效的预览命令请求".into()));
    }

    let app_state = {
        let state_guard = state.lock().await;
        state_guard.app_state.clone()
    };
    let target_addrs = {
        let preview_registry = app_state.preview_registry.lock().await;
        preview_registry.session_members()
    };

    for target_addr in target_addrs {
        let _ = send_message_to_preview(
            &app_state,
            target_addr,
            Message::Text(request.clone().into()),
        )
        .await;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use axum::{
        body::Body,
        http::{
            header::{ACCESS_CONTROL_ALLOW_ORIGIN, CACHE_CONTROL, ORIGIN, VARY},
            HeaderMap, HeaderValue,
        },
        response::Response,
    };
    use std::path::Path;

    use super::{
        append_cors_headers, apply_cache_control, resolve_cors_origin, resolve_thumbnail_request,
        supports_thumbnail, CacheControlPolicy, StaticAssetQuery, ThumbnailRequest,
        ThumbnailResizeMode,
    };

    fn headers_with_origin(origin: &'static str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(ORIGIN, HeaderValue::from_static(origin));
        headers
    }

    #[test]
    fn resolve_cors_origin_allows_known_app_origins() {
        for origin in [
            "http://localhost:1420",
            "http://127.0.0.1:1420",
            "http://tauri.localhost",
            "tauri://localhost",
        ] {
            assert_eq!(
                resolve_cors_origin(&headers_with_origin(origin)),
                Some(origin),
                "origin {origin} should be allowed"
            );
        }
    }

    #[test]
    fn resolve_cors_origin_rejects_unknown_origins() {
        assert_eq!(resolve_cors_origin(&HeaderMap::new()), None);
        assert_eq!(
            resolve_cors_origin(&headers_with_origin("http://localhost:3000")),
            None
        );
        assert_eq!(
            resolve_cors_origin(&headers_with_origin("https://example.com")),
            None
        );
    }

    #[test]
    fn resolve_cors_origin_rejects_non_utf8_origin() {
        let mut headers = HeaderMap::new();
        headers.insert(
            ORIGIN,
            HeaderValue::from_bytes(b"http://localhost:1420\xff").unwrap(),
        );

        assert_eq!(resolve_cors_origin(&headers), None);
    }

    #[test]
    fn append_cors_headers_sets_origin_and_vary_for_allowed_origin() {
        let mut response = Response::new(Body::empty());
        append_cors_headers(&mut response, Some("http://localhost:1420"));

        assert_eq!(
            response.headers().get(ACCESS_CONTROL_ALLOW_ORIGIN),
            Some(&HeaderValue::from_static("http://localhost:1420"))
        );
        assert_eq!(
            response.headers().get(VARY),
            Some(&HeaderValue::from_static("Origin"))
        );
    }

    #[test]
    fn append_cors_headers_keeps_vary_without_allow_origin_when_origin_is_missing() {
        let mut response = Response::new(Body::empty());
        append_cors_headers(&mut response, None);

        assert_eq!(response.headers().get(ACCESS_CONTROL_ALLOW_ORIGIN), None);
        assert_eq!(
            response.headers().get(VARY),
            Some(&HeaderValue::from_static("Origin"))
        );
    }

    #[test]
    fn cache_control_values_match_product_contract() {
        let thumbnail_response =
            apply_cache_control(Response::new(Body::empty()), CacheControlPolicy::Thumbnail);
        assert_eq!(
            thumbnail_response.headers().get(CACHE_CONTROL),
            Some(&HeaderValue::from_static("public, max-age=86400"))
        );

        let static_response = apply_cache_control(
            Response::new(Body::empty()),
            CacheControlPolicy::StaticAsset,
        );
        assert_eq!(
            static_response.headers().get(CACHE_CONTROL),
            Some(&HeaderValue::from_static(
                "no-store, no-cache, must-revalidate, max-age=0"
            ))
        );
    }

    #[test]
    fn thumbnail_request_requires_positive_width_and_height() {
        assert_eq!(
            resolve_thumbnail_request(&StaticAssetQuery {
                width: None,
                height: Some(360),
                resize_mode: Some(ThumbnailResizeMode::Cover),
            }),
            None
        );
        assert_eq!(
            resolve_thumbnail_request(&StaticAssetQuery {
                width: Some(640),
                height: Some(0),
                resize_mode: Some(ThumbnailResizeMode::Cover),
            }),
            None
        );
    }

    #[test]
    fn thumbnail_request_clamps_dimensions_and_preserves_fit() {
        assert_eq!(
            resolve_thumbnail_request(&StaticAssetQuery {
                width: Some(8192),
                height: Some(4096),
                resize_mode: Some(ThumbnailResizeMode::Cover),
            }),
            Some(ThumbnailRequest {
                width: 2048,
                height: 2048,
                resize_mode: ThumbnailResizeMode::Cover,
            })
        );
    }

    #[test]
    fn thumbnail_source_formats_match_product_boundary() {
        assert!(supports_thumbnail(Path::new("icon.ico")));
        assert!(supports_thumbnail(Path::new("cover.png")));
        assert!(supports_thumbnail(Path::new("cover.jpg")));
        assert!(supports_thumbnail(Path::new("cover.jpeg")));
        assert!(supports_thumbnail(Path::new("cover.gif")));
        assert!(supports_thumbnail(Path::new("cover.webp")));

        assert!(!supports_thumbnail(Path::new("cover.bmp")));
        assert!(!supports_thumbnail(Path::new("cover.tif")));
        assert!(!supports_thumbnail(Path::new("cover.tiff")));
    }
}
