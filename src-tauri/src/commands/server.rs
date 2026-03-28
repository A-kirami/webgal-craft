// 服务器模块：提供静态文件服务和WebSocket通信功能
// 主要功能：
// 1. 静态文件服务：支持多个静态站点托管
// 2. WebSocket通信：支持广播和单播消息
// 3. 服务器管理：启动、停止和状态管理

use std::{
    collections::HashMap,
    hash::{Hash, Hasher},
    io::Cursor,
    net::SocketAddr,
    path::{Component, Path, PathBuf},
    sync::Arc,
};

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        ConnectInfo, Path as AxumPath, State as AxumState,
    },
    http::{
        header::{ACCESS_CONTROL_ALLOW_ORIGIN, CACHE_CONTROL, CONTENT_TYPE, ORIGIN, VARY},
        HeaderMap, HeaderValue, Request, StatusCode, Uri,
    },
    response::{IntoResponse, Redirect, Response},
    routing::get,
    Router,
};
use futures::{SinkExt, StreamExt};
use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, ImageFormat};
use portpicker::pick_unused_port;
use tauri::{ipc::Channel, State as TauriState};
use tokio::{
    net::TcpListener,
    sync::{broadcast, mpsc, oneshot, Mutex, RwLock},
    task::JoinHandle,
};
use tower::util::ServiceExt;
use tower_http::services::ServeDir;

use super::{AppError, AppResult};

const STATIC_FILE_ALLOWED_CORS_ORIGINS: [&str; 4] = [
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "http://tauri.localhost",
    "tauri://localhost",
];

/// 应用程序状态
/// 包含：
/// - sites: 静态站点映射表，键为站点哈希，值为(路径, 服务实例)元组
/// - broadcast_tx: 广播消息发送器，用于向所有客户端发送消息
/// - unicast_clients: WebSocket客户端映射表，用于单播消息发送
struct AppState {
    sites: RwLock<HashMap<String, (PathBuf, ServeDir)>>,
    // 广播通道用于高效广播
    broadcast_tx: broadcast::Sender<Message>,
    // 独立通道映射用于单播
    unicast_clients: Mutex<HashMap<SocketAddr, mpsc::UnboundedSender<Message>>>,
}

/// 服务器状态管理
/// 包含：
/// - app_state: 应用程序状态，包含站点信息和消息通道
/// - server_handle: 服务器运行句柄，用于控制服务器生命周期
/// - server_address: 服务器监听地址，用于客户端连接
pub struct ServerState {
    app_state: Arc<AppState>,
    server_handle: Option<ServerHandle>,
    server_address: Option<SocketAddr>,
}

/// 服务器控制句柄
/// 用于管理服务器的生命周期，包含：
/// - join_handle: 异步任务句柄，用于等待服务器关闭
/// - shutdown_tx: 关闭信号发送器，用于触发服务器优雅关闭
struct ServerHandle {
    join_handle: JoinHandle<()>,
    shutdown_tx: oneshot::Sender<()>,
}

const MAX_THUMBNAIL_DIMENSION: u32 = 2048;
const JPEG_THUMBNAIL_QUALITY: u8 = 85;

impl Default for ServerState {
    fn default() -> Self {
        // 创建广播通道（容量100条消息）
        let (broadcast_tx, _) = broadcast::channel(100);

        Self {
            app_state: Arc::new(AppState {
                sites: RwLock::new(HashMap::new()),
                broadcast_tx,
                unicast_clients: Mutex::new(HashMap::new()),
            }),
            server_handle: None,
            server_address: None,
        }
    }
}

/// WebSocket连接处理函数
/// 处理新的WebSocket连接请求，并升级HTTP连接为WebSocket连接
/// 参数：
/// - ws: WebSocket升级请求
/// - state: 应用程序状态
/// - addr: 客户端地址
/// - on_message: 消息处理通道
async fn handle_ws(
    ws: WebSocketUpgrade,
    AxumState(state): AxumState<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    on_message: Channel<String>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_ws_socket(socket, state, addr, on_message))
}

/// WebSocket连接建立后的处理函数
/// 实现功能：
/// 1. 消息接收和广播：处理客户端消息并转发给其他客户端
/// 2. 客户端注册和注销：管理客户端连接状态
/// 3. 错误处理和连接关闭：确保资源正确释放
///
/// 参数：
/// - socket: WebSocket连接实例
/// - state: 应用程序状态
/// - addr: 客户端地址
/// - on_message: 消息处理通道
async fn handle_ws_socket(
    socket: WebSocket,
    state: Arc<AppState>,
    addr: SocketAddr,
    on_message: Channel<String>,
) {
    let (mut ws_tx, mut ws_rx) = socket.split();

    // 创建单播通道
    let (unicast_tx, mut unicast_rx) = mpsc::unbounded_channel();

    // 注册客户端
    state.unicast_clients.lock().await.insert(addr, unicast_tx);

    // 订阅广播
    let mut broadcast_rx = state.broadcast_tx.subscribe();

    // 消息处理任务
    let recv_task = tokio::spawn({
        let on_message = on_message.clone();
        async move {
            while let Some(Ok(msg)) = ws_rx.next().await {
                match msg {
                    Message::Text(text) => {
                        let _ = on_message.send(text.to_string());
                    }
                    Message::Close(_) => {
                        break;
                    }
                    _ => {
                        continue;
                    }
                }
            }
        }
    });

    // 发送任务（综合广播和单播）
    let send_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                // 处理广播消息
                Ok(msg) = broadcast_rx.recv() => {
                    if ws_tx.send(msg).await.is_err() {
                        break;
                    }
                }
                // 处理单播消息
                Some(msg) = unicast_rx.recv() => {
                    if ws_tx.send(msg).await.is_err() {
                        break;
                    }
                }
                // 退出条件
                else => break,
            }
        }
    });

    // 等待任务完成
    tokio::select! {
        _ = recv_task => (),
        _ = send_task => (),
    }

    // 注销客户端
    state.unicast_clients.lock().await.remove(&addr);
    println!("Client disconnected: {}", addr);
}

/// 处理静态文件请求
/// 根据站点哈希和请求路径返回对应的静态文件
///
/// 参数：
/// - state: 应用程序状态
/// - hash: 站点哈希值
/// - path: 请求的文件路径
///
/// 返回：
/// - 成功：静态文件响应
/// - 失败：HTTP状态码
fn resolve_static_file_cors_origin(origin: Option<&str>) -> Option<&'static str> {
    let origin = origin?;
    STATIC_FILE_ALLOWED_CORS_ORIGINS
        .iter()
        .copied()
        .find(|allowed_origin| *allowed_origin == origin)
}

fn resolve_static_file_cors_origin_from_headers(headers: &HeaderMap) -> Option<&'static str> {
    resolve_static_file_cors_origin(headers.get(ORIGIN).and_then(|origin| origin.to_str().ok()))
}

fn append_static_file_cors_headers(response: &mut Response, origin: Option<&'static str>) {
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

async fn handle_static_request(
    AxumState(state): AxumState<Arc<AppState>>,
    AxumPath(hash): AxumPath<String>,
    uri: Uri,
    path: Option<String>,
    origin: Option<&'static str>,
) -> Response {
    let sites = state.sites.read().await;
    let query = parse_static_asset_query(uri.query());

    if let Some((site_root, serve_dir)) = sites.get(&hash) {
        let serve_dir = serve_dir.to_owned();
        let site_root = site_root.clone();
        drop(sites);

        if let Some(thumbnail_request) = resolve_thumbnail_request(&query) {
            if let Some(response) =
                try_build_thumbnail_response(site_root.clone(), path.clone(), thumbnail_request)
                    .await
            {
                let mut response = apply_cache_control(response, CacheControlPolicy::Thumbnail);
                append_static_file_cors_headers(&mut response, origin);
                return response;
            }
        }

        let uri = build_static_asset_uri(path.as_deref());

        match serve_dir
            .oneshot(Request::builder().uri(uri).body(()).unwrap())
            .await
        {
            Ok(response) => {
                let mut response =
                    apply_cache_control(response.into_response(), CacheControlPolicy::StaticAsset);
                append_static_file_cors_headers(&mut response, origin);
                response
            }
            Err(_) => {
                let mut response = StatusCode::INTERNAL_SERVER_ERROR.into_response();
                append_static_file_cors_headers(&mut response, origin);
                response
            }
        }
    } else {
        let mut response = StatusCode::NOT_FOUND.into_response();
        append_static_file_cors_headers(&mut response, origin);
        response
    }
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

fn build_static_asset_uri(path: Option<&str>) -> String {
    match path {
        Some(path) => {
            let encoded_path = path
                .split('/')
                .map(|segment| urlencoding::encode(segment))
                .collect::<Vec<_>>()
                .join("/");
            format!("/{encoded_path}")
        }
        None => "/".to_string(),
    }
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
    site_root: PathBuf,
    path: Option<String>,
    thumbnail_request: ThumbnailRequest,
) -> Option<Response> {
    let file_path = resolve_static_asset_path(&site_root, path.as_deref())?;
    if !supports_thumbnail(&file_path) {
        return None;
    }

    let encoded_thumbnail =
        tokio::task::spawn_blocking(move || build_thumbnail(&file_path, thumbnail_request))
            .await
            .ok()??;

    let mut response = Response::new(encoded_thumbnail.body.into());
    response.headers_mut().insert(
        CONTENT_TYPE,
        HeaderValue::from_static(encoded_thumbnail.content_type),
    );
    Some(response)
}

fn resolve_static_asset_path(site_root: &Path, path: Option<&str>) -> Option<PathBuf> {
    let path = path?;
    let relative_path = Path::new(path);

    if relative_path.is_absolute() {
        return None;
    }

    let mut resolved_path = site_root.to_path_buf();

    for component in relative_path.components() {
        match component {
            Component::Normal(segment) => resolved_path.push(segment),
            Component::CurDir => {}
            _ => return None,
        }
    }

    Some(resolved_path)
}

fn supports_thumbnail(path: &Path) -> bool {
    let Some(extension) = path.extension().and_then(|extension| extension.to_str()) else {
        return false;
    };

    matches!(
        extension.to_ascii_lowercase().as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "ico"
    )
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

fn apply_cache_control(mut response: Response, cache_policy: CacheControlPolicy) -> Response {
    let cache_control = resolve_cache_control_value(cache_policy);
    response
        .headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static(cache_control));
    response
}

fn resolve_cache_control_value(cache_policy: CacheControlPolicy) -> &'static str {
    match cache_policy {
        CacheControlPolicy::StaticAsset => "no-store, no-cache, must-revalidate, max-age=0",
        CacheControlPolicy::Thumbnail => "public, max-age=86400",
    }
}

/// 启动HTTP服务器
/// 功能：
/// 1. 停止已存在的服务器实例
/// 2. 绑定指定端口（如果端口被占用则自动选择新端口）
/// 3. 设置路由和中间件
/// 4. 启动服务器并返回访问地址
///
/// 参数：
/// - state: 服务器状态
/// - host: 服务器主机地址
/// - port: 服务器端口号
/// - on_message: 消息处理通道
///
/// 返回：
/// - 成功：服务器访问地址
/// - 失败：错误信息
#[tauri::command]
pub async fn start_server(
    state: TauriState<'_, Mutex<ServerState>>,
    host: String,
    port: u16,
    on_message: Channel<String>,
) -> AppResult<String> {
    let mut state_guard = state.lock().await;

    // 停止已存在的服务器
    if let Some(handle) = state_guard.server_handle.take() {
        let _ = handle.shutdown_tx.send(());
        handle.join_handle.await.ok();
    }

    // 获取可用端口
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

    // 构建路由
    let app = Router::new()
        .route(
            "/api/webgalsync",
            get(move |ws, state, addr| handle_ws(ws, state, addr, on_message)),
        )
        .route("/game/{hash}", get(handle_redirect))
        .route(
            "/game/{hash}/",
            get(
                |state: AxumState<Arc<AppState>>,
                 hash: AxumPath<String>,
                 uri: Uri,
                 headers: HeaderMap| async move {
                    handle_static_request(
                        state,
                        hash,
                        uri,
                        None,
                        resolve_static_file_cors_origin_from_headers(&headers),
                    )
                    .await
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
                    handle_static_request(
                        state,
                        AxumPath(hash),
                        uri,
                        Some(path),
                        resolve_static_file_cors_origin_from_headers(&headers),
                    )
                    .await
                },
            ),
        )
        .with_state(state_guard.app_state.clone());

    let (shutdown_tx, shutdown_rx) = oneshot::channel();

    let join_handle = tokio::spawn(async move {
        axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .with_graceful_shutdown(async {
            shutdown_rx.await.ok();
        })
        .await
        .unwrap();
    });

    state_guard.server_handle = Some(ServerHandle {
        join_handle,
        shutdown_tx,
    });

    state_guard.server_address = Some(addr);

    println!("Server started at: {}", addr);
    Ok(format!("http://{addr}"))
}

/// 将不带斜杠的URL重定向到带斜杠的URL
/// 例如：/game/abc -> /game/abc/
///
/// 参数：
/// - uri: 原始请求URI
///
/// 返回：
/// - 重定向响应
async fn handle_redirect(uri: Uri) -> Result<Redirect, StatusCode> {
    Ok(Redirect::permanent(&format!("{}/", uri.path())))
}

/// 标准化路径并生成唯一哈希值
/// 用于标识和管理静态站点
///
/// 参数：
/// - path: 待处理的路径字符串
///
/// 返回：
/// - 成功：(站点哈希值, 标准化后的路径)
/// - 失败：错误信息
fn normalize_and_hash_path(path: &str) -> AppResult<(String, PathBuf)> {
    let path_buf = PathBuf::from(path);

    if !path_buf.exists() {
        return Err(AppError::Server("路径不存在".into()));
    }

    if !path_buf.is_dir() {
        return Err(AppError::Server("路径必须是目录".into()));
    }

    let canonical_path = path_buf
        .canonicalize()
        .map_err(|e| AppError::Server(format!("无法标准化路径: {e}")))?;

    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    canonical_path.hash(&mut hasher);
    let hash = format!("{:x}", hasher.finish());

    Ok((hash, canonical_path))
}

/// 添加静态站点
/// 将指定目录注册为静态站点，并返回站点哈希值
///
/// 参数：
/// - state: 服务器状态
/// - path: 静态站点目录路径
///
/// 返回：
/// - 成功：站点哈希值
/// - 失败：错误信息
#[tauri::command]
pub async fn add_static_site(
    state: TauriState<'_, Mutex<ServerState>>,
    path: String,
) -> AppResult<String> {
    let state_guard = state.lock().await;
    let (hash, path_buf) = normalize_and_hash_path(&path)?;

    let mut sites = state_guard.app_state.sites.write().await;

    // 如果站点已存在，直接返回其哈希值
    if sites.contains_key(&hash) {
        return Ok(hash);
    }

    // 创建服务目录实例
    let serve_dir = ServeDir::new(&path_buf).append_index_html_on_directories(true);

    sites.insert(hash.clone(), (path_buf, serve_dir));

    Ok(hash)
}

/// 广播消息
/// 向所有连接的WebSocket客户端发送消息
///
/// 参数：
/// - state: 服务器状态
/// - message: 要广播的消息内容
///
/// 返回：
/// - 成功：空值
/// - 失败：错误信息
#[tauri::command]
pub async fn broadcast_message(
    state: TauriState<'_, Mutex<ServerState>>,
    message: String,
) -> AppResult<()> {
    let state_guard = state.lock().await;
    // 使用广播通道高效发送
    state_guard
        .app_state
        .broadcast_tx
        .send(Message::Text(message.into()))
        .map_err(|_| AppError::Server("Broadcast failed".into()))?;
    Ok(())
}

/// 单播消息
/// 向指定的WebSocket客户端发送消息
///
/// 参数：
/// - state: 服务器状态
/// - client_addr: 目标客户端地址（格式：IP:端口）
/// - message: 要发送的消息内容
///
/// 返回：
/// - 成功：空值
/// - 失败：错误信息
#[tauri::command]
pub async fn unicast_message(
    state: TauriState<'_, Mutex<ServerState>>,
    client_addr: String,
    message: String,
) -> AppResult<()> {
    let state_guard = state.lock().await;
    let clients = state_guard.app_state.unicast_clients.lock().await;

    // 解析地址
    let addr: SocketAddr = client_addr
        .parse()
        .map_err(|_| AppError::Server("Invalid client address".into()))?;

    if let Some(tx) = clients.get(&addr) {
        tx.send(Message::Text(message.into()))
            .map_err(|_| AppError::Server("Failed to send unicast message".into()))?;
        Ok(())
    } else {
        Err(AppError::Server("Client not found".into()))
    }
}

/// 获取已连接的客户端列表
/// 返回所有连接的WebSocket客户端的地址列表
///
/// 参数：
/// - state: 服务器状态
///
/// 返回：
/// - 成功：客户端地址列表
/// - 失败：错误信息
#[tauri::command]
pub async fn get_connected_clients(
    state: TauriState<'_, Mutex<ServerState>>,
) -> AppResult<Vec<String>> {
    let state_guard = state.lock().await;
    let clients = state_guard.app_state.unicast_clients.lock().await;

    Ok(clients.keys().map(|addr| addr.to_string()).collect())
}

#[cfg(test)]
mod tests {
    use axum::{
        body::Body,
        http::{
            header::{ACCESS_CONTROL_ALLOW_ORIGIN, ORIGIN, VARY},
            HeaderMap, HeaderValue,
        },
        response::Response,
    };
    use std::path::Path;

    use super::{
        append_static_file_cors_headers, resolve_cache_control_value,
        resolve_static_file_cors_origin, resolve_static_file_cors_origin_from_headers,
        resolve_thumbnail_request, supports_thumbnail, CacheControlPolicy, StaticAssetQuery,
        ThumbnailRequest, ThumbnailResizeMode,
    };

    #[test]
    fn resolve_static_file_cors_origin_allows_known_app_origins() {
        assert_eq!(
            resolve_static_file_cors_origin(Some("http://localhost:1420")),
            Some("http://localhost:1420")
        );
        assert_eq!(
            resolve_static_file_cors_origin(Some("http://127.0.0.1:1420")),
            Some("http://127.0.0.1:1420")
        );
        assert_eq!(
            resolve_static_file_cors_origin(Some("http://tauri.localhost")),
            Some("http://tauri.localhost")
        );
        assert_eq!(
            resolve_static_file_cors_origin(Some("tauri://localhost")),
            Some("tauri://localhost")
        );
    }

    #[test]
    fn resolve_static_file_cors_origin_rejects_unknown_origins() {
        assert_eq!(resolve_static_file_cors_origin(None), None);
        assert_eq!(
            resolve_static_file_cors_origin(Some("http://localhost:3000")),
            None
        );
        assert_eq!(
            resolve_static_file_cors_origin(Some("https://example.com")),
            None
        );
        assert_eq!(resolve_static_file_cors_origin(Some("null")), None);
    }

    #[test]
    fn resolve_static_file_cors_origin_from_headers_returns_allowed_origin() {
        let mut headers = HeaderMap::new();
        headers.insert(ORIGIN, HeaderValue::from_static("http://localhost:1420"));

        assert_eq!(
            resolve_static_file_cors_origin_from_headers(&headers),
            Some("http://localhost:1420")
        );
    }

    #[test]
    fn resolve_static_file_cors_origin_from_headers_rejects_missing_or_invalid_origin() {
        let missing_headers = HeaderMap::new();
        assert_eq!(
            resolve_static_file_cors_origin_from_headers(&missing_headers),
            None
        );

        let mut invalid_headers = HeaderMap::new();
        invalid_headers.insert(
            ORIGIN,
            HeaderValue::from_bytes(b"http://localhost:1420\xff").unwrap(),
        );

        assert_eq!(
            resolve_static_file_cors_origin_from_headers(&invalid_headers),
            None
        );
    }

    #[test]
    fn append_static_file_cors_headers_sets_origin_and_vary_for_allowed_origin() {
        let mut response = Response::new(Body::empty());

        append_static_file_cors_headers(&mut response, Some("http://localhost:1420"));

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
    fn append_static_file_cors_headers_keeps_vary_without_allow_origin_when_origin_is_missing() {
        let mut response = Response::new(Body::empty());

        append_static_file_cors_headers(&mut response, None);

        assert_eq!(response.headers().get(ACCESS_CONTROL_ALLOW_ORIGIN), None);
        assert_eq!(
            response.headers().get(VARY),
            Some(&HeaderValue::from_static("Origin"))
        );
    }

    #[test]
    fn generated_thumbnails_use_public_cache() {
        assert_eq!(
            resolve_cache_control_value(CacheControlPolicy::Thumbnail),
            "public, max-age=86400"
        );
    }

    #[test]
    fn static_assets_disable_cache_even_when_content_is_media() {
        assert_eq!(
            resolve_cache_control_value(CacheControlPolicy::StaticAsset),
            "no-store, no-cache, must-revalidate, max-age=0"
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
