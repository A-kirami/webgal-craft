mod preview_sync;

use std::{
    collections::HashMap,
    hash::{Hash, Hasher},
    io::{Cursor, ErrorKind},
    net::SocketAddr,
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration, Instant},
};

use axum::{
    body::{to_bytes, Body, Bytes},
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        ConnectInfo, Path as AxumPath, State as AxumState,
    },
    http::{
        header::{
            ACCESS_CONTROL_ALLOW_ORIGIN, CACHE_CONTROL, CONTENT_LENGTH, CONTENT_TYPE, ORIGIN,
            RANGE, SEC_WEBSOCKET_PROTOCOL, VARY,
        },
        HeaderMap, HeaderValue, Request, StatusCode, Uri,
    },
    response::{IntoResponse, Redirect, Response},
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, ImageFormat};
use percent_encoding::percent_decode_str;
use preview_sync::{
    build_empty_response, build_preview_ready_updated_event, is_host_message,
    parse_register_preview_request, requests_v1_subprotocol, target_scope_for_preview_request,
    PreviewSessionRegistry, RegisterPreviewRequestPayload, EDITOR_PREVIEW_PROTOCOL_V1_SUBPROTOCOL,
    SESSION_REGISTER_PREVIEW_TYPE,
};
use sha2::{Digest, Sha256};
use tauri::{ipc::Channel, State as TauriState};
use tokio::{
    net::TcpListener,
    sync::{mpsc, oneshot, Mutex, RwLock},
    task::JoinHandle,
};
use tower::util::ServiceExt;
use tower_http::services::ServeFile;

use crate::vfs::{
    resolve_default_template_path, sanitize_request_path, to_posix_string, CachedCanonicals,
    OverlayFs, VfsError,
};

use super::{AppError, AppResult};

const STATIC_FILE_ALLOWED_CORS_ORIGINS: [&str; 4] = [
    "http://localhost:1420",
    "http://127.0.0.1:1420",
    "http://tauri.localhost",
    "tauri://localhost",
];
const PREVIEW_FRAME_BRIDGE_MARKER: &str = "webgal-craft-preview-frame-bridge";
const PREVIEW_FRAME_BRIDGE_MAX_HTML_BYTES: u64 = 2 * 1024 * 1024;
const PREVIEW_FRAME_BRIDGE_SCRIPT: &str = r#"<script data-webgal-craft-preview-frame-bridge>
(() => {
  if (window.parent === window) {
    return;
  }

  const spaceKeyMessageType = 'webgal.preview.viewport.space-key';
  const pointerMessageType = 'webgal.preview.viewport.pointer';
  const wheelMessageType = 'webgal.preview.viewport.wheel';
  const outputSettingsMessageType = 'webgal.preview.output-settings';
  const spaceCursorAttribute = 'data-webgal-craft-preview-viewport-space';
  const style = document.createElement('style');
  style.textContent = `
    [${spaceCursorAttribute}="grab"],
    [${spaceCursorAttribute}="grab"] * {
      cursor: grab !important;
    }

    [${spaceCursorAttribute}="grabbing"],
    [${spaceCursorAttribute}="grabbing"] * {
      cursor: grabbing !important;
    }

    [${spaceCursorAttribute}="auto"],
    [${spaceCursorAttribute}="auto"] * {
      cursor: auto !important;
    }
  `;
  const styleHost = document.head || document.documentElement;
  if (styleHost) {
    styleHost.append(style);
  }

  const mediaVolumeDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
  const nativeMediaPlay = HTMLMediaElement.prototype.play;
  const mediaVolumes = new WeakMap();
  let outputVolume = 1;

  const clampRatio = (value) => Math.min(Math.max(value, 0), 1);
  const rememberMediaElement = (mediaElement) => {
    if (!mediaVolumes.has(mediaElement) && mediaVolumeDescriptor?.get) {
      mediaVolumes.set(mediaElement, mediaVolumeDescriptor.get.call(mediaElement));
    }
  };
  const applyMediaVolume = (mediaElement) => {
    if (!mediaVolumeDescriptor?.set) {
      return;
    }

    rememberMediaElement(mediaElement);
    const mediaVolume = mediaVolumes.get(mediaElement) ?? 1;
    mediaVolumeDescriptor.set.call(mediaElement, clampRatio(mediaVolume) * outputVolume);
  };
  const applyOutputVolume = () => {
    document.querySelectorAll('audio, video').forEach(applyMediaVolume);
  };

  if (mediaVolumeDescriptor?.configurable && mediaVolumeDescriptor.get && mediaVolumeDescriptor.set) {
    Object.defineProperty(HTMLMediaElement.prototype, 'volume', {
      configurable: mediaVolumeDescriptor.configurable,
      enumerable: mediaVolumeDescriptor.enumerable,
      get() {
        return mediaVolumes.get(this) ?? mediaVolumeDescriptor.get.call(this);
      },
      set(value) {
        const mediaVolume = clampRatio(Number(value));
        mediaVolumes.set(this, mediaVolume);
        mediaVolumeDescriptor.set.call(this, mediaVolume * outputVolume);
      },
    });

    HTMLMediaElement.prototype.play = function (...args) {
      applyMediaVolume(this);
      return nativeMediaPlay.apply(this, args);
    };
  }

  const applyOutputSettings = (settings) => {
    outputVolume = settings.muted ? 0 : settings.volume;
    applyOutputVolume();
  };

  const parentTargetOrigin = (() => {
    if (!document.referrer) {
      return '*';
    }

    try {
      return new URL(document.referrer).origin;
    } catch {
      return '*';
    }
  })();

  const isEditableTarget = (target) => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    const tagName = target.tagName.toLowerCase();
    return target.isContentEditable
      || tagName === 'input'
      || tagName === 'select'
      || tagName === 'textarea';
  };

  const postSpaceKey = (pressed) => {
    window.parent.postMessage({
      type: spaceKeyMessageType,
      pressed,
    }, parentTargetOrigin);
  };

  const postPointer = (eventType, event) => {
    window.parent.postMessage({
      type: pointerMessageType,
      eventType,
      button: event.button,
      buttons: event.buttons,
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId,
    }, parentTargetOrigin);
  };

  let cursorResetFrameId;
  let middlePointerCaptureTarget;
  let middlePointerId;

  const cancelCursorReset = () => {
    if (cursorResetFrameId === undefined) {
      return;
    }

    cancelAnimationFrame(cursorResetFrameId);
    cursorResetFrameId = undefined;
  };

  const applySpaceCursor = (cursor) => {
    if (!cursor) {
      document.documentElement.removeAttribute(spaceCursorAttribute);
      return;
    }

    document.documentElement.setAttribute(spaceCursorAttribute, cursor);
  };

  const scheduleCursorReset = () => {
    cancelCursorReset();
    applySpaceCursor('auto');

    cursorResetFrameId = requestAnimationFrame(() => {
      cursorResetFrameId = requestAnimationFrame(() => {
        cursorResetFrameId = undefined;
        applySpaceCursor('');
      });
    });
  };

  const setSpaceCursor = (pressed) => {
    if (pressed) {
      cancelCursorReset();
      applySpaceCursor('grab');
      return;
    }

    scheduleCursorReset();
  };

  const captureMiddlePointer = (event) => {
    if (!(event.target instanceof Element) || typeof event.target.setPointerCapture !== 'function') {
      return;
    }

    try {
      event.target.setPointerCapture(event.pointerId);
      middlePointerCaptureTarget = event.target;
    } catch {
      middlePointerCaptureTarget = undefined;
    }
  };

  const releaseMiddlePointer = () => {
    if (!middlePointerCaptureTarget || middlePointerId === undefined) {
      return;
    }

    const captureTarget = middlePointerCaptureTarget;
    middlePointerCaptureTarget = undefined;

    if (typeof captureTarget.hasPointerCapture === 'function' && !captureTarget.hasPointerCapture(middlePointerId)) {
      return;
    }
    if (typeof captureTarget.releasePointerCapture !== 'function') {
      return;
    }

    try {
      captureTarget.releasePointerCapture(middlePointerId);
    } catch {
      // 指针捕获可能已被浏览器自动释放。
    }
  };

  const endMiddlePointer = (eventType, event) => {
    if (event.pointerId !== middlePointerId) {
      return;
    }

    event.preventDefault();
    postPointer(eventType, event);
    releaseMiddlePointer();
    middlePointerId = undefined;
    scheduleCursorReset();
  };

  window.addEventListener('mousedown', (event) => {
    if (event.button === 1) {
      event.preventDefault();
    }
  });

  window.addEventListener('auxclick', (event) => {
    if (event.button === 1) {
      event.preventDefault();
    }
  });

  window.addEventListener('pointerdown', (event) => {
    if (event.button !== 1) {
      return;
    }

    event.preventDefault();
    middlePointerId = event.pointerId;
    captureMiddlePointer(event);
    cancelCursorReset();
    applySpaceCursor('grabbing');
    postPointer('pointerdown', event);
  });

  window.addEventListener('pointermove', (event) => {
    if (event.pointerId !== middlePointerId) {
      return;
    }

    event.preventDefault();
    postPointer('pointermove', event);
  });

  window.addEventListener('pointerup', (event) => {
    endMiddlePointer('pointerup', event);
  });

  window.addEventListener('pointercancel', (event) => {
    endMiddlePointer('pointercancel', event);
  });

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || isEditableTarget(event.target)) {
      return;
    }

    event.preventDefault();
    setSpaceCursor(true);
    postSpaceKey(true);
  });

  window.addEventListener('keyup', (event) => {
    if (event.code !== 'Space') {
      return;
    }

    setSpaceCursor(false);
    postSpaceKey(false);
  });

  window.addEventListener('blur', () => {
    requestAnimationFrame(() => {
      if (document.hasFocus()) {
        return;
      }

      setSpaceCursor(false);
      postSpaceKey(false);
    });
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) {
      return;
    }

    const data = event.data;
    if (!data
      || typeof data !== 'object'
      || data.type !== spaceKeyMessageType
      || typeof data.pressed !== 'boolean') {
      return;
    }

    setSpaceCursor(data.pressed);
  });

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) {
      return;
    }

    const data = event.data;
    const hasValidVolume = typeof data?.volume === 'number'
      && Number.isFinite(data.volume)
      && data.volume >= 0
      && data.volume <= 1;
    if (data?.type !== outputSettingsMessageType
      || typeof data.muted !== 'boolean'
      || !hasValidVolume) {
      return;
    }

    applyOutputSettings(data);
  });

  window.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();
    window.parent.postMessage({
      type: wheelMessageType,
      clientX: event.clientX,
      clientY: event.clientY,
      ctrlKey: event.ctrlKey,
      deltaY: event.deltaY,
      metaKey: event.metaKey,
    }, parentTargetOrigin);
  }, { passive: false });
})();
</script>"#;

struct AppState {
    sites: RwLock<HashMap<String, CachedCanonicals>>,
    preview_clients: Mutex<HashMap<SocketAddr, mpsc::UnboundedSender<Message>>>,
    preview_registry: Mutex<PreviewSessionRegistry>,
    editor_event_channel: RwLock<Option<Channel<String>>>,
    thumbnail_cache: Mutex<ThumbnailCache>,
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
const THUMBNAIL_CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const THUMBNAIL_CACHE_MAX_ENTRIES: usize = 512;
const THUMBNAIL_CACHE_MAX_BYTES: usize = 64 * 1024 * 1024;
const THUMBNAIL_CACHE_MAX_ALIASES: usize = 2048;

impl ServerState {
    pub fn new() -> Self {
        Self {
            app_state: Arc::new(AppState {
                sites: RwLock::new(HashMap::new()),
                preview_clients: Mutex::new(HashMap::new()),
                preview_registry: Mutex::new(PreviewSessionRegistry::default()),
                editor_event_channel: RwLock::new(None),
                thumbnail_cache: Mutex::new(ThumbnailCache::default()),
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

async fn forward_host_message_to_editor(state: &Arc<AppState>, message: String) {
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

    if !is_host_message(&text) {
        return;
    }

    let should_forward = {
        let preview_registry = state.preview_registry.lock().await;
        preview_registry.preferred_event_source() == Some(addr)
    };

    if should_forward {
        forward_host_message_to_editor(state, text).await;
    }
}

async fn cleanup_disconnected_preview(state: &Arc<AppState>, addr: SocketAddr) {
    state.preview_clients.lock().await.remove(&addr);
    let preferred_event_source_changed = state.preview_registry.lock().await.unregister(addr);

    if preferred_event_source_changed {
        if let Ok(message) = build_preview_ready_updated_event(false) {
            forward_host_message_to_editor(state, message).await;
        }
    }
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

fn should_inject_preview_frame_bridge(logical_path: &Path, response: &Response) -> bool {
    if response.status() != StatusCode::OK || logical_path != Path::new("index.html") {
        return false;
    }

    response
        .headers()
        .get(CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .is_some_and(|length| length <= PREVIEW_FRAME_BRIDGE_MAX_HTML_BYTES)
}

fn inject_preview_frame_bridge(html: &str) -> String {
    if html.contains(PREVIEW_FRAME_BRIDGE_MARKER) {
        return html.to_string();
    }

    let index = html.find("</head>").unwrap_or_default();
    let mut output = String::with_capacity(html.len() + PREVIEW_FRAME_BRIDGE_SCRIPT.len());
    output.push_str(&html[..index]);
    output.push_str(PREVIEW_FRAME_BRIDGE_SCRIPT);
    output.push_str(&html[index..]);
    output
}

async fn inject_preview_frame_bridge_response(logical_path: &Path, response: Response) -> Response {
    if !should_inject_preview_frame_bridge(logical_path, &response) {
        return response;
    }

    let (mut parts, body) = response.into_parts();
    let Ok(bytes) = to_bytes(body, PREVIEW_FRAME_BRIDGE_MAX_HTML_BYTES as usize).await else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    let Ok(html) = String::from_utf8(bytes.to_vec()) else {
        return Response::from_parts(parts, Body::from(bytes));
    };

    let injected_html = inject_preview_frame_bridge(&html);
    parts.headers.remove(CONTENT_LENGTH);
    let mut response = Response::from_parts(parts, Body::from(injected_html));
    response.headers_mut().insert(
        CONTENT_TYPE,
        HeaderValue::from_static("text/html; charset=utf-8"),
    );
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
    let thumbnail_alias = resolve_thumbnail_request(&query).map(|request| ThumbnailRequestAlias {
        site_hash: hash.clone(),
        logical_path: to_posix_string(&logical_path),
        request,
    });

    let overlay = OverlayFs::from_cached(&site);

    let resolved_logical_path = logical_path.clone();
    let physical_path =
        match tokio::task::spawn_blocking(move || overlay.resolve_file(&resolved_logical_path))
            .await
        {
            Ok(Ok(path)) => path,
            Ok(Err(error)) => {
                if let Some(response) =
                    try_fallback_thumbnail_response(&state, thumbnail_alias.as_ref(), &error).await
                {
                    return finalize_thumbnail_response(response, origin);
                }

                return finalize_cors(map_vfs_error(&error).into_response(), origin);
            }
            Err(_) => {
                return finalize_cors(StatusCode::INTERNAL_SERVER_ERROR.into_response(), origin)
            }
        };

    if let Some(alias) = thumbnail_alias {
        if let Some(response) = try_build_thumbnail_response(&state, &physical_path, alias).await {
            return finalize_thumbnail_response(response, origin);
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
    let response = inject_preview_frame_bridge_response(&logical_path, response).await;

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

#[derive(Debug, Clone, Copy, Default, Hash, PartialEq, Eq)]
enum ThumbnailResizeMode {
    #[default]
    Contain,
    Cover,
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq)]
struct ThumbnailRequest {
    width: u32,
    height: u32,
    resize_mode: ThumbnailResizeMode,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct EncodedThumbnail {
    body: Bytes,
    content_type: &'static str,
}

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
struct ThumbnailContentKey {
    source_hash: [u8; 32],
    request: ThumbnailRequest,
}

impl ThumbnailContentKey {
    fn from_source(source: &[u8], request: ThumbnailRequest) -> Self {
        let mut source_hash = [0; 32];
        source_hash.copy_from_slice(&Sha256::digest(source));

        Self {
            source_hash,
            request,
        }
    }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
struct ThumbnailRequestAlias {
    site_hash: String,
    logical_path: String,
    request: ThumbnailRequest,
}

#[derive(Debug, Clone, Copy)]
struct ThumbnailCacheConfig {
    ttl: Duration,
    max_entries: usize,
    max_bytes: usize,
    max_aliases: usize,
}

impl Default for ThumbnailCacheConfig {
    fn default() -> Self {
        Self {
            ttl: THUMBNAIL_CACHE_TTL,
            max_entries: THUMBNAIL_CACHE_MAX_ENTRIES,
            max_bytes: THUMBNAIL_CACHE_MAX_BYTES,
            max_aliases: THUMBNAIL_CACHE_MAX_ALIASES,
        }
    }
}

struct ThumbnailCacheEntry {
    thumbnail: Arc<EncodedThumbnail>,
    created_at: Instant,
    last_accessed: Instant,
}

struct ThumbnailAliasEntry {
    content_key: ThumbnailContentKey,
    last_accessed: Instant,
}

struct ThumbnailCache {
    config: ThumbnailCacheConfig,
    entries: HashMap<ThumbnailContentKey, ThumbnailCacheEntry>,
    aliases: HashMap<ThumbnailRequestAlias, ThumbnailAliasEntry>,
    total_bytes: usize,
}

impl Default for ThumbnailCache {
    fn default() -> Self {
        Self::new(ThumbnailCacheConfig::default())
    }
}

impl ThumbnailCache {
    fn new(config: ThumbnailCacheConfig) -> Self {
        Self {
            config,
            entries: HashMap::new(),
            aliases: HashMap::new(),
            total_bytes: 0,
        }
    }

    fn get_by_content_and_bind_alias(
        &mut self,
        key: &ThumbnailContentKey,
        alias: ThumbnailRequestAlias,
        now: Instant,
    ) -> Option<Arc<EncodedThumbnail>> {
        self.remove_expired(now);

        let entry = self.entries.get_mut(key)?;
        entry.last_accessed = now;
        let thumbnail = entry.thumbnail.clone();
        self.bind_alias(alias, key.clone(), now);
        self.enforce_alias_limit();

        Some(thumbnail)
    }

    fn get_by_alias(
        &mut self,
        alias: &ThumbnailRequestAlias,
        now: Instant,
    ) -> Option<Arc<EncodedThumbnail>> {
        self.remove_expired(now);

        let content_key = {
            let alias_entry = self.aliases.get_mut(alias)?;
            alias_entry.last_accessed = now;
            alias_entry.content_key.clone()
        };
        let entry = self.entries.get_mut(&content_key)?;
        entry.last_accessed = now;

        Some(entry.thumbnail.clone())
    }

    fn insert(
        &mut self,
        key: ThumbnailContentKey,
        alias: ThumbnailRequestAlias,
        thumbnail: Arc<EncodedThumbnail>,
        now: Instant,
    ) {
        self.remove_expired(now);

        let size_bytes = thumbnail.body.len();
        if let Some(previous) = self.entries.remove(&key) {
            self.total_bytes = self
                .total_bytes
                .saturating_sub(previous.thumbnail.body.len());
        }

        self.total_bytes += size_bytes;
        self.entries.insert(
            key.clone(),
            ThumbnailCacheEntry {
                thumbnail,
                created_at: now,
                last_accessed: now,
            },
        );
        self.bind_alias(alias, key, now);

        self.enforce_limits();
    }

    fn bind_alias(
        &mut self,
        alias: ThumbnailRequestAlias,
        content_key: ThumbnailContentKey,
        now: Instant,
    ) {
        self.aliases.insert(
            alias,
            ThumbnailAliasEntry {
                content_key,
                last_accessed: now,
            },
        );
    }

    fn remove_expired(&mut self, now: Instant) {
        let ttl = self.config.ttl;
        let expired_keys = self
            .entries
            .iter()
            .filter(|(_, entry)| now > entry.created_at + ttl)
            .map(|(key, _)| key.clone())
            .collect::<Vec<_>>();

        for key in expired_keys {
            self.remove_entry(&key);
        }
    }

    fn enforce_limits(&mut self) {
        while self.entries.len() > self.config.max_entries
            || self.total_bytes > self.config.max_bytes
        {
            let Some(key) = self.least_recently_used_entry_key() else {
                break;
            };
            self.remove_entry(&key);
        }

        self.enforce_alias_limit();
    }

    fn enforce_alias_limit(&mut self) {
        while self.aliases.len() > self.config.max_aliases {
            let Some(alias) = self.least_recently_used_alias_key() else {
                break;
            };
            self.aliases.remove(&alias);
        }
    }

    fn least_recently_used_entry_key(&self) -> Option<ThumbnailContentKey> {
        self.entries
            .iter()
            .min_by_key(|(_, entry)| entry.last_accessed)
            .map(|(key, _)| key.clone())
    }

    fn least_recently_used_alias_key(&self) -> Option<ThumbnailRequestAlias> {
        self.aliases
            .iter()
            .min_by_key(|(_, entry)| entry.last_accessed)
            .map(|(key, _)| key.clone())
    }

    fn remove_entry(&mut self, key: &ThumbnailContentKey) {
        if let Some(entry) = self.entries.remove(key) {
            self.total_bytes = self.total_bytes.saturating_sub(entry.thumbnail.body.len());
        }
        self.aliases
            .retain(|_, alias_entry| alias_entry.content_key != *key);
    }

    #[cfg(test)]
    fn entry_count(&self) -> usize {
        self.entries.len()
    }

    #[cfg(test)]
    fn alias_count(&self) -> usize {
        self.aliases.len()
    }
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

        let decoded_value = percent_decode_str(value).decode_utf8().ok();
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

fn can_fallback_to_thumbnail_cache(error: &VfsError) -> bool {
    matches!(error, VfsError::NotFound)
        || matches!(error, VfsError::Io(error) if error.kind() == ErrorKind::NotFound)
}

async fn try_fallback_thumbnail_response(
    state: &Arc<AppState>,
    alias: Option<&ThumbnailRequestAlias>,
    error: &VfsError,
) -> Option<Response> {
    if !can_fallback_to_thumbnail_cache(error) {
        return None;
    }

    try_build_cached_thumbnail_response(state, alias?).await
}

async fn try_build_thumbnail_response(
    state: &Arc<AppState>,
    physical_path: &Path,
    alias: ThumbnailRequestAlias,
) -> Option<Response> {
    if !supports_thumbnail(physical_path) {
        return None;
    }

    let request = alias.request;
    let source = match tokio::task::spawn_blocking({
        let path = physical_path.to_path_buf();
        move || std::fs::read(path)
    })
    .await
    {
        Ok(Ok(source)) => source,
        Ok(Err(error)) if error.kind() == ErrorKind::NotFound => {
            return try_build_cached_thumbnail_response(state, &alias).await;
        }
        Ok(Err(_)) | Err(_) => return None,
    };
    let content_key = ThumbnailContentKey::from_source(&source, request);
    let now = Instant::now();

    if let Some(encoded_thumbnail) = state
        .thumbnail_cache
        .lock()
        .await
        .get_by_content_and_bind_alias(&content_key, alias.clone(), now)
    {
        return Some(build_thumbnail_response(encoded_thumbnail));
    }

    let encoded_thumbnail = Arc::new(
        tokio::task::spawn_blocking(move || build_thumbnail_from_source(&source, request))
            .await
            .ok()??,
    );

    state.thumbnail_cache.lock().await.insert(
        content_key,
        alias,
        encoded_thumbnail.clone(),
        Instant::now(),
    );

    Some(build_thumbnail_response(encoded_thumbnail))
}

async fn try_build_cached_thumbnail_response(
    state: &Arc<AppState>,
    alias: &ThumbnailRequestAlias,
) -> Option<Response> {
    let encoded_thumbnail = state
        .thumbnail_cache
        .lock()
        .await
        .get_by_alias(alias, Instant::now())?;

    Some(build_thumbnail_response(encoded_thumbnail))
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

fn build_thumbnail_response(encoded_thumbnail: Arc<EncodedThumbnail>) -> Response {
    let mut response = Response::new(Body::from(encoded_thumbnail.body.clone()));
    response.headers_mut().insert(
        CONTENT_TYPE,
        HeaderValue::from_static(encoded_thumbnail.content_type),
    );
    response
}

fn finalize_thumbnail_response(response: Response, origin: Option<&'static str>) -> Response {
    finalize_cors(
        apply_cache_control(response, CacheControlPolicy::Thumbnail),
        origin,
    )
}

fn build_thumbnail_from_source(
    source: &[u8],
    request: ThumbnailRequest,
) -> Option<EncodedThumbnail> {
    let image = image::load_from_memory(source).ok()?;
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
            body: Bytes::from(cursor.into_inner()),
            content_type: "image/png",
        });
    }

    let mut body = Vec::new();
    JpegEncoder::new_with_quality(&mut body, JPEG_THUMBNAIL_QUALITY)
        .encode_image(&thumbnail)
        .ok()?;

    Some(EncodedThumbnail {
        body: Bytes::from(body),
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
        Err(error) => {
            log::warn!("HTTP 服务器端口不可用，回退到系统分配端口: {address}, error: {error}");
            TcpListener::bind(format!("{host}:0")).await?
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
    let app_state = {
        let state_guard = state.lock().await;
        state_guard.app_state.clone()
    };
    let target_scope = target_scope_for_preview_request(&request)
        .ok_or_else(|| AppError::Server("无效的预览请求".into()))?;
    let target_addrs = {
        let preview_registry = app_state.preview_registry.lock().await;
        preview_registry.target_addrs_for_request_scope(target_scope)
    };

    if target_addrs.is_empty() {
        log::warn!(
            "send_preview_command: 未找到可用预览目标 scope={target_scope:?}; 预览命令未发送"
        );
        return Ok(());
    }

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
        body::{to_bytes, Body, Bytes},
        extract::{Path as AxumPath, State as AxumState},
        http::{
            header::{ACCESS_CONTROL_ALLOW_ORIGIN, CACHE_CONTROL, ORIGIN, VARY},
            HeaderMap, HeaderValue, StatusCode, Uri,
        },
        response::{IntoResponse, Response},
    };
    use std::{
        fs,
        future::Future,
        path::Path,
        sync::Arc,
        time::{Duration, Instant},
    };
    use tempfile::TempDir;

    use super::{
        append_cors_headers, apply_cache_control, handle_static_request,
        inject_preview_frame_bridge, resolve_cors_origin, resolve_thumbnail_request,
        should_inject_preview_frame_bridge, supports_thumbnail, AppState, CacheControlPolicy,
        EncodedThumbnail, ServerState, StaticAssetQuery, ThumbnailCache, ThumbnailCacheConfig,
        ThumbnailContentKey, ThumbnailRequest, ThumbnailRequestAlias, ThumbnailResizeMode,
        PREVIEW_FRAME_BRIDGE_MARKER,
    };
    use crate::vfs::CachedCanonicals;

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

    #[test]
    fn preview_index_html_injection_adds_frame_bridge() {
        let html = "<!doctype html><html><head></head><body></body></html>";
        let injected = inject_preview_frame_bridge(html);
        let script_index = injected
            .find(PREVIEW_FRAME_BRIDGE_MARKER)
            .expect("预览桥接脚本应被插入");
        let head_end_index = injected
            .find("</head>")
            .expect("测试 HTML 应包含 head 结束标签");

        assert!(script_index < head_end_index);
        assert!(injected.contains("window.parent === window"));
        assert!(injected.contains("data-webgal-craft-preview-viewport-space"));
        assert!(injected.contains("event.source !== window.parent"));
        assert!(injected.contains("webgal.preview.viewport.space-key"));
        assert!(injected.contains("webgal.preview.viewport.wheel"));
        assert!(injected.contains("webgal.preview.viewport.pointer"));
        assert!(injected.contains("webgal.preview.output-settings"));
        assert!(injected.contains("HTMLMediaElement.prototype, 'volume'"));
        assert!(!injected.contains("hasValidBrightness"));
        assert!(injected.contains("pointerdown"));
    }

    #[test]
    fn preview_index_html_injection_is_idempotent() {
        let html = format!(
            "<!doctype html><html><head>{}</head><body></body></html>",
            PREVIEW_FRAME_BRIDGE_MARKER
        );
        let injected = inject_preview_frame_bridge(&html);

        assert_eq!(injected, html);
    }

    #[test]
    fn preview_index_html_injection_requires_ok_response() {
        let response = StatusCode::PARTIAL_CONTENT.into_response();

        assert!(!should_inject_preview_frame_bridge(
            Path::new("index.html"),
            &response
        ));
    }

    fn test_cache_config() -> ThumbnailCacheConfig {
        ThumbnailCacheConfig {
            ttl: Duration::from_secs(60),
            max_entries: 8,
            max_bytes: 1024,
            max_aliases: 8,
        }
    }

    fn test_thumbnail_request() -> ThumbnailRequest {
        ThumbnailRequest {
            width: 128,
            height: 128,
            resize_mode: ThumbnailResizeMode::Contain,
        }
    }

    fn test_thumbnail(body: &[u8]) -> EncodedThumbnail {
        EncodedThumbnail {
            body: Bytes::copy_from_slice(body),
            content_type: "image/png",
        }
    }

    fn test_alias(
        site_hash: &str,
        logical_path: &str,
        request: ThumbnailRequest,
    ) -> ThumbnailRequestAlias {
        ThumbnailRequestAlias {
            site_hash: site_hash.into(),
            logical_path: logical_path.into(),
            request,
        }
    }

    fn block_on(future: impl Future<Output = ()>) {
        tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(future);
    }

    fn create_test_png(root: &Path, relative_path: &str) {
        let path = root.join(relative_path);
        fs::create_dir_all(path.parent().expect("测试图片应存在父目录")).unwrap();
        let image = image::RgbaImage::from_pixel(4, 4, image::Rgba([255, 0, 0, 255]));
        image.save(path).unwrap();
    }

    async fn registered_state(root: &Path) -> Arc<AppState> {
        let state = ServerState::new().app_state;
        state.sites.write().await.insert(
            "site".into(),
            CachedCanonicals::compute(root.to_path_buf(), None, None).unwrap(),
        );
        state
    }

    async fn request_thumbnail(state: Arc<AppState>, logical_path: &str) -> Response {
        let uri = format!("/game/site/{logical_path}?w=64&h=64")
            .parse::<Uri>()
            .unwrap();

        handle_static_request(
            AxumState(state),
            AxumPath("site".into()),
            uri,
            Some(logical_path.into()),
            HeaderMap::new(),
        )
        .await
    }

    async fn response_body(response: Response) -> Vec<u8> {
        to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap()
            .to_vec()
    }

    #[test]
    fn thumbnail_request_falls_back_to_alias_cache_when_source_disappears() {
        block_on(async {
            let root = TempDir::new().unwrap();
            create_test_png(root.path(), "icons/favicon.png");
            let state = registered_state(root.path()).await;

            let first_response = request_thumbnail(state.clone(), "icons/favicon.png").await;
            assert_eq!(first_response.status(), StatusCode::OK);
            let first_body = response_body(first_response).await;
            assert!(!first_body.is_empty());

            fs::remove_file(root.path().join("icons/favicon.png")).unwrap();
            let second_response = request_thumbnail(state, "icons/favicon.png").await;

            assert_eq!(second_response.status(), StatusCode::OK);
            assert_eq!(response_body(second_response).await, first_body);
        });
    }

    #[test]
    fn thumbnail_request_reuses_content_cache_between_different_paths() {
        block_on(async {
            let root = TempDir::new().unwrap();
            create_test_png(root.path(), "icons/favicon.png");
            fs::create_dir_all(root.path().join("assets/copy")).unwrap();
            fs::copy(
                root.path().join("icons/favicon.png"),
                root.path().join("assets/copy/favicon.png"),
            )
            .unwrap();

            let state = registered_state(root.path()).await;

            let first_response = request_thumbnail(state.clone(), "icons/favicon.png").await;
            assert_eq!(first_response.status(), StatusCode::OK);
            let first_body = response_body(first_response).await;

            let second_response = request_thumbnail(state.clone(), "assets/copy/favicon.png").await;
            assert_eq!(second_response.status(), StatusCode::OK);
            assert_eq!(response_body(second_response).await, first_body);

            let cache = state.thumbnail_cache.lock().await;
            assert_eq!(cache.entry_count(), 1);
            assert_eq!(cache.alias_count(), 2);
        });
    }

    #[test]
    fn thumbnail_cache_reuses_content_between_different_paths() {
        let mut cache = ThumbnailCache::new(test_cache_config());
        let request = test_thumbnail_request();
        let first_alias = test_alias("site-a", "icons/favicon.ico", request);
        let second_alias = test_alias("site-b", "assets/copy/favicon.ico", request);
        let content_key = ThumbnailContentKey::from_source(b"same image bytes", request);
        let thumbnail = Arc::new(test_thumbnail(b"encoded-thumbnail"));
        let now = Instant::now();

        cache.insert(content_key.clone(), first_alias, thumbnail.clone(), now);

        let content_hit = cache
            .get_by_content_and_bind_alias(&content_key, second_alias.clone(), now)
            .expect("内容缓存命中应返回缩略图");
        let alias_hit = cache
            .get_by_alias(&second_alias, now)
            .expect("别名缓存命中应返回缩略图");

        assert!(
            Arc::ptr_eq(&content_hit, &alias_hit),
            "路径别名应绑定到同一个内容缓存项，便于源文件失效后回退"
        );
        assert_eq!(content_hit.as_ref(), thumbnail.as_ref());
        assert_eq!(cache.entry_count(), 1);
    }

    #[test]
    fn thumbnail_cache_expires_content_and_alias_together() {
        let mut cache = ThumbnailCache::new(test_cache_config());
        let request = test_thumbnail_request();
        let alias = test_alias("site", "cover.png", request);
        let content_key = ThumbnailContentKey::from_source(b"cover bytes", request);
        let now = Instant::now();

        cache.insert(
            content_key,
            alias.clone(),
            Arc::new(test_thumbnail(b"cached")),
            now,
        );

        assert_eq!(
            cache.get_by_alias(&alias, now + Duration::from_secs(61)),
            None
        );
        assert_eq!(cache.entry_count(), 0);
        assert_eq!(cache.alias_count(), 0);
    }

    #[test]
    fn thumbnail_cache_evicts_least_recently_used_entries_over_capacity() {
        let mut cache = ThumbnailCache::new(ThumbnailCacheConfig {
            ttl: Duration::from_secs(60),
            max_entries: 1,
            max_bytes: 1024,
            max_aliases: 4,
        });
        let request = test_thumbnail_request();
        let first_alias = test_alias("site", "first.png", request);
        let second_alias = test_alias("site", "second.png", request);
        let now = Instant::now();

        cache.insert(
            ThumbnailContentKey::from_source(b"first", request),
            first_alias.clone(),
            Arc::new(test_thumbnail(b"first-thumbnail")),
            now,
        );
        cache.insert(
            ThumbnailContentKey::from_source(b"second", request),
            second_alias.clone(),
            Arc::new(test_thumbnail(b"second-thumbnail")),
            now + Duration::from_secs(1),
        );

        assert_eq!(cache.get_by_alias(&first_alias, now), None);
        assert_eq!(
            cache
                .get_by_alias(&second_alias, now + Duration::from_secs(1))
                .as_deref(),
            Some(&test_thumbnail(b"second-thumbnail"))
        );
        assert_eq!(cache.entry_count(), 1);
    }
}
