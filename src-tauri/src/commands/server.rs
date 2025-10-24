// 服务器模块：提供静态文件服务和WebSocket通信功能
// 主要功能：
// 1. 静态文件服务：支持多个静态站点托管
// 2. WebSocket通信：支持广播和单播消息
// 3. 服务器管理：启动、停止和状态管理

use std::{
    collections::HashMap,
    hash::{Hash, Hasher},
    net::SocketAddr,
    path::PathBuf,
    sync::Arc,
};

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        ConnectInfo, Path as AxumPath, State as AxumState,
    },
    http::{Request, StatusCode, Uri},
    response::{IntoResponse, Redirect},
    routing::get,
    Router,
};
use futures::{SinkExt, StreamExt};
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
async fn handle_static_request(
    AxumState(state): AxumState<Arc<AppState>>,
    AxumPath(hash): AxumPath<String>,
    path: Option<String>,
) -> Result<impl IntoResponse, StatusCode> {
    let sites = state.sites.read().await;

    if let Some((_, serve_dir)) = sites.get(&hash) {
        let uri = match path {
            Some(p) => {
                // 对路径进行 URL 编码
                let encoded_path = p
                    .split('/')
                    .map(|segment| urlencoding::encode(segment))
                    .collect::<Vec<_>>()
                    .join("/");
                format!("/{encoded_path}")
            }
            None => "/".to_string(),
        };

        match serve_dir
            .to_owned()
            .oneshot(Request::builder().uri(uri).body(()).unwrap())
            .await
        {
            Ok(response) => Ok(response.into_response()),
            Err(_) => Err(StatusCode::INTERNAL_SERVER_ERROR),
        }
    } else {
        Err(StatusCode::NOT_FOUND)
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
                |state: AxumState<Arc<AppState>>, hash: AxumPath<String>| async move {
                    handle_static_request(state, hash, None).await
                },
            ),
        )
        .route(
            "/game/{hash}/{*path}",
            get(
                |state: AxumState<Arc<AppState>>, path: AxumPath<(String, String)>| async move {
                    let (hash, path) = path.0;
                    handle_static_request(state, AxumPath(hash), Some(path)).await
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

/// 移除静态站点
/// 根据路径移除已注册的静态站点
///
/// 参数：
/// - state: 服务器状态
/// - path: 静态站点目录路径
///
/// 返回：
/// - 成功：空值
/// - 失败：错误信息
#[tauri::command]
pub async fn remove_static_site(
    state: TauriState<'_, Mutex<ServerState>>,
    path: String,
) -> AppResult<()> {
    let state_guard = state.lock().await;
    let (hash, _) = normalize_and_hash_path(&path)?;

    let mut sites = state_guard.app_state.sites.write().await;
    sites.remove(&hash);

    Ok(())
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
