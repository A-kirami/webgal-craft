use std::{
    collections::HashSet,
    fs,
    io::{BufWriter, Cursor, ErrorKind, Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use image::{imageops, DynamicImage, RgbaImage};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

use super::{game::read_game_config, AppError, AppResult};
use crate::vfs::{CachedCanonicals, OverlayFs, VfsDirEntry, VfsError};

const PLATFORM_WEB: &str = "web";
const STEP_PREPARING: &str = "export.progress.preparing";
const STEP_COPYING_ENGINE: &str = "export.progress.copyingEngine";
const STEP_COPYING_GAME: &str = "export.progress.copyingGame";
const STEP_COPYING_ICONS: &str = "export.progress.copyingIcons";
const STEP_UPDATING_MANIFEST: &str = "export.progress.updatingManifest";
pub(super) const STEP_FINISHED: &str = "export.progress.finished";
const WEB_ICON_FILE_NAMES: [&str; 6] = [
    "apple-touch-icon.png",
    "favicon.ico",
    "icon-192-maskable.png",
    "icon-192.png",
    "icon-512-maskable.png",
    "icon-512.png",
];
const STEP_PACKING_RESOURCES: &str = "export.progress.packingResources";
const STEP_COPYING_RUNTIME: &str = "export.progress.copyingRuntime";
const STEP_WRITING_CONFIG: &str = "export.progress.writingConfig";
const NEUTRALINO_RUNTIME_VERSION: &str = "6.9.0";
const NEUTRALINO_RUNTIME_ARCHIVE_URL: &str =
    "https://github.com/neutralinojs/neutralinojs/releases/download/v6.9.0/neutralinojs-v6.9.0.zip";
const NEUTRALINO_CLIENT: &[u8] = include_bytes!("../../resources/neutralino/6.9.0/neutralino.js");
const NEUTRALINO_CLIENT_LICENSE: &[u8] = include_bytes!("../../resources/neutralino/6.9.0/LICENSE");
const NEUTRALINO_FULLSCREEN_BRIDGE: &[u8] =
    include_bytes!("../../resources/webgalcraft-neutralino-fullscreen.js");
const NEUTRALINO_CLIENT_PATH: &str = "webgalcraft-neutralino.js";
const NEUTRALINO_CLIENT_LICENSE_PATH: &str = "webgalcraft-neutralino-LICENSE.txt";
const NEUTRALINO_FULLSCREEN_BRIDGE_PATH: &str = "webgalcraft-neutralino-fullscreen.js";
static EXPORT_WORK_ID: AtomicU64 = AtomicU64::new(0);

const PC_ICON_FALLBACKS: [&str; 4] = [
    "icon-512.png",
    "icon-192.png",
    "apple-touch-icon.png",
    "favicon.ico",
];
const ICON_SOURCE_CANVAS_SIZE: u32 = 1536;
const ICON_MAIN_INSET: u32 = ICON_SOURCE_CANVAS_SIZE / 6;
const DESKTOP_ICON_INSET_RATIO: f32 = 0.0636;
const ROUNDED_ICON_RADIUS_RATIO: f32 = 34.0 / 300.0;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct IconSourceState {
    background_color: String,
    background_offset_ratio: IconOffsetRatio,
    background_scale: f32,
    background_type: String,
    foreground_offset_ratio: IconOffsetRatio,
    foreground_scale: f32,
    icon_shape: String,
    version: u8,
}

#[derive(Deserialize)]
struct IconOffsetRatio {
    x: f32,
    y: f32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportProgress {
    export_id: String,
    platform: String,
    step: String,
    percentage: u8,
}

#[derive(Debug)]
enum MaterializedNode {
    Directory { logical_path: PathBuf },
    File { logical_path: PathBuf },
}

pub(super) fn export_error(message: impl Into<String>) -> AppError {
    AppError::Export(message.into())
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PcWindowConfig {
    pub width: u32,
    pub height: u32,
    pub min_width: u32,
    pub min_height: u32,
    pub full_screen: bool,
    pub resizable: bool,
}

pub struct PcExportRequest<'a> {
    pub engine_path: &'a Path,
    pub game_path: &'a Path,
    pub template_path: Option<&'a Path>,
    pub runtime_path: &'a Path,
    pub output_path: &'a Path,
    pub game_name: &'a str,
    pub target_os: &'a str,
    pub target_arch: &'a str,
    pub window: &'a PcWindowConfig,
    pub replace_existing: bool,
}

fn neutralino_runtime_entry(target_os: &str, target_arch: &str) -> AppResult<&'static str> {
    match (target_os, target_arch) {
        ("windows", "x64") => Ok("neutralino-win_x64.exe"),
        ("macos", "x64") => Ok("neutralino-mac_x64"),
        ("macos", "arm64") => Ok("neutralino-mac_arm64"),
        ("linux", "x64") => Ok("neutralino-linux_x64"),
        _ => Err(export_error("不支持的 PC 目标平台或架构")),
    }
}

fn pc_platform(target_os: &str, target_arch: &str) -> AppResult<String> {
    neutralino_runtime_entry(target_os, target_arch)?;
    Ok(format!("{target_os}-{target_arch}"))
}

fn pc_runtime_cache_path(
    app: &AppHandle,
    target_os: &str,
    target_arch: &str,
) -> AppResult<PathBuf> {
    let entry = neutralino_runtime_entry(target_os, target_arch)?;
    let app_data_dir = app.path().app_data_dir()?;
    Ok(app_data_dir
        .join("cache")
        .join("runtimes")
        .join(format!("neutralinojs-v{NEUTRALINO_RUNTIME_VERSION}"))
        .join(format!("{target_os}-{target_arch}"))
        .join(entry))
}

fn extract_neutralino_runtime(archive: &[u8], entry_name: &str) -> AppResult<Vec<u8>> {
    let mut archive = zip::ZipArchive::new(Cursor::new(archive))
        .map_err(|error| export_error(format!("Neutralinojs 运行时压缩包无效: {error}")))?;
    let mut entry = archive
        .by_name(entry_name)
        .map_err(|error| export_error(format!("Neutralinojs 运行时缺少目标二进制: {error}")))?;
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry.read_to_end(&mut bytes)?;
    Ok(bytes)
}

fn resolve_neutralino_runtime_url(proxy_prefix: Option<&str>) -> AppResult<String> {
    let Some(raw_prefix) = proxy_prefix
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(NEUTRALINO_RUNTIME_ARCHIVE_URL.to_owned());
    };
    let prefix_url = reqwest::Url::parse(raw_prefix)
        .map_err(|error| export_error(format!("Neutralino 运行时下载代理地址无效: {error}")))?;
    if prefix_url.scheme() != "https"
        || prefix_url.host_str().is_none()
        || !prefix_url.username().is_empty()
        || prefix_url.password().is_some()
        || prefix_url.query().is_some()
        || prefix_url.fragment().is_some()
    {
        return Err(export_error(
            "Neutralino 运行时下载代理必须是无凭据的 HTTPS 地址",
        ));
    }

    let prefix = if raw_prefix.ends_with('/') {
        raw_prefix.to_owned()
    } else {
        format!("{raw_prefix}/")
    };
    let proxied_url = format!("{prefix}{NEUTRALINO_RUNTIME_ARCHIVE_URL}");
    let parsed_url = reqwest::Url::parse(&proxied_url)
        .map_err(|error| export_error(format!("Neutralino 运行时代理下载地址无效: {error}")))?;
    if parsed_url.scheme() != "https" || parsed_url.host_str().is_none() {
        return Err(export_error("Neutralino 运行时代理下载地址必须使用 HTTPS"));
    }
    Ok(proxied_url)
}

fn package_resources(
    root: &Path,
    archive_path: &Path,
    report: &mut impl FnMut(&str, u8) -> AppResult<()>,
) -> AppResult<()> {
    let mut files = Vec::new();
    collect_files(root, root, &mut files)?;
    let total = files.len().max(1);
    let mut header_files = serde_json::Map::new();
    let mut offset = 0_u64;

    for (path, relative) in &files {
        let size = fs::metadata(path)?.len();
        add_asar_file(&mut header_files, relative, size, offset)?;
        offset += size;
    }

    let mut header = serde_json::to_vec(&serde_json::json!({ "files": header_files }))
        .map_err(|error| export_error(format!("resources.neu 头信息序列化失败: {error}")))?;
    let header_size =
        u32::try_from(header.len()).map_err(|_| export_error("resources.neu 头信息过大"))?;
    let aligned_header_size = (header_size + 3) & !3;
    header.resize(aligned_header_size as usize, 0);

    let mut archive = BufWriter::new(fs::File::create(archive_path)?);
    archive.write_all(&4_u32.to_le_bytes())?;
    archive.write_all(&(aligned_header_size + 8).to_le_bytes())?;
    archive.write_all(&(aligned_header_size + 4).to_le_bytes())?;
    archive.write_all(&header_size.to_le_bytes())?;
    archive.write_all(&header)?;
    report(STEP_PACKING_RESOURCES, 35)?;
    for (index, (path, _)) in files.into_iter().enumerate() {
        let mut source = fs::File::open(path)?;
        std::io::copy(&mut source, &mut archive)?;
        report(
            STEP_PACKING_RESOURCES,
            35 + ((index + 1) * 45 / total) as u8,
        )?;
    }
    archive.flush()?;
    report(STEP_PACKING_RESOURCES, 80)
}

fn add_asar_file(
    directory: &mut serde_json::Map<String, serde_json::Value>,
    path: &Path,
    size: u64,
    offset: u64,
) -> AppResult<()> {
    let mut components = path.components();
    let Some(component) = components.next() else {
        return Err(export_error("resources.neu 文件路径为空"));
    };
    let component = component.as_os_str().to_string_lossy().into_owned();

    if components.as_path().as_os_str().is_empty() {
        directory.insert(
            component,
            serde_json::json!({ "size": size, "offset": offset.to_string() }),
        );
        return Ok(());
    }

    let entry = directory
        .entry(component)
        .or_insert_with(|| serde_json::json!({ "files": {} }));
    let files = entry
        .get_mut("files")
        .and_then(serde_json::Value::as_object_mut)
        .ok_or_else(|| export_error("resources.neu 目录结构冲突"))?;
    add_asar_file(files, components.as_path(), size, offset)
}

fn resolve_icon_in(root: &Path) -> Option<PathBuf> {
    let icons = root.join("icons");
    PC_ICON_FALLBACKS
        .iter()
        .map(|name| icons.join(name))
        .find(|path| path.is_file())
}

fn resolve_pc_icon(game_path: &Path, runtime_root: &Path) -> Option<PathBuf> {
    resolve_icon_in(game_path).or_else(|| resolve_icon_in(runtime_root))
}

fn desktop_icon_from_source(game_path: &Path) -> Option<DynamicImage> {
    let source_root = game_path.join(".webgalcraft/icon-data");
    let state: IconSourceState =
        serde_json::from_slice(&fs::read(source_root.join("state.json")).ok()?).ok()?;
    if state.version != 1 || !matches!(state.icon_shape.as_str(), "square" | "rounded" | "circle") {
        return None;
    }
    let foreground =
        image::load_from_memory(&fs::read(source_root.join("foreground.png")).ok()?).ok()?;
    let background = if state.background_type == "image" {
        image::load_from_memory(&fs::read(source_root.join("background.png")).ok()?).ok()?
    } else if state.background_type == "color" {
        let color = parse_hex_color(&state.background_color)?;
        DynamicImage::ImageRgba8(RgbaImage::from_pixel(
            ICON_SOURCE_CANVAS_SIZE,
            ICON_SOURCE_CANVAS_SIZE,
            color,
        ))
    } else {
        return None;
    };
    let mut canvas = RgbaImage::new(ICON_SOURCE_CANVAS_SIZE, ICON_SOURCE_CANVAS_SIZE);
    draw_icon_source(
        &mut canvas,
        &background,
        &state.background_offset_ratio,
        state.background_scale,
    );
    draw_icon_source(
        &mut canvas,
        &foreground,
        &state.foreground_offset_ratio,
        state.foreground_scale,
    );
    Some(DynamicImage::ImageRgba8(clip_desktop_icon(
        &canvas,
        &state.icon_shape,
    )))
}

fn clip_desktop_icon(source: &RgbaImage, shape: &str) -> RgbaImage {
    let main_size = ICON_SOURCE_CANVAS_SIZE - ICON_MAIN_INSET * 2;
    let main_icon = imageops::crop_imm(
        source,
        ICON_MAIN_INSET,
        ICON_MAIN_INSET,
        main_size,
        main_size,
    )
    .to_image();
    let desktop_inset = (main_size as f32 * DESKTOP_ICON_INSET_RATIO) as u32;
    let desktop_size = main_size - desktop_inset * 2;
    let mut desktop_icon = imageops::crop_imm(
        &main_icon,
        desktop_inset,
        desktop_inset,
        desktop_size,
        desktop_size,
    )
    .to_image();

    match shape {
        "square" => {}
        "rounded" => apply_rounded_mask(
            &mut desktop_icon,
            main_size as f32 * ROUNDED_ICON_RADIUS_RATIO,
        ),
        "circle" => apply_circle_mask(&mut desktop_icon),
        _ => unreachable!("icon shape was validated before rendering"),
    }
    desktop_icon
}

fn apply_rounded_mask(image: &mut RgbaImage, radius: f32) {
    let width = image.width() as f32;
    let height = image.height() as f32;
    for (x, y, pixel) in image.enumerate_pixels_mut() {
        let x = x as f32 + 0.5;
        let y = y as f32 + 0.5;
        let nearest_x = x.clamp(radius, width - radius);
        let nearest_y = y.clamp(radius, height - radius);
        if (x - nearest_x).powi(2) + (y - nearest_y).powi(2) > radius.powi(2) {
            pixel.0 = [0, 0, 0, 0];
        }
    }
}

fn apply_circle_mask(image: &mut RgbaImage) {
    let center = image.width() as f32 / 2.0;
    let radius_squared = center.powi(2);
    for (x, y, pixel) in image.enumerate_pixels_mut() {
        let x = x as f32 + 0.5 - center;
        let y = y as f32 + 0.5 - center;
        if x.powi(2) + y.powi(2) > radius_squared {
            pixel.0 = [0, 0, 0, 0];
        }
    }
}

fn parse_hex_color(value: &str) -> Option<image::Rgba<u8>> {
    let color = value.strip_prefix('#')?;
    if color.len() != 6 {
        return None;
    }
    let red = u8::from_str_radix(&color[0..2], 16).ok()?;
    let green = u8::from_str_radix(&color[2..4], 16).ok()?;
    let blue = u8::from_str_radix(&color[4..6], 16).ok()?;
    Some(image::Rgba([red, green, blue, u8::MAX]))
}

fn draw_icon_source(
    canvas: &mut RgbaImage,
    source: &DynamicImage,
    offset: &IconOffsetRatio,
    scale: f32,
) {
    let source = source.to_rgba8();
    let scale = scale.max(0.0);
    let (width, height) = source.dimensions();
    if width == 0 || height == 0 || scale == 0.0 {
        return;
    }
    let ratio = width as f32 / height as f32;
    let canvas_size = ICON_SOURCE_CANVAS_SIZE as f32;
    let target_width = ((if ratio > 1.0 {
        canvas_size
    } else {
        canvas_size * ratio
    }) * scale) as u32;
    let target_height = ((if ratio > 1.0 {
        canvas_size / ratio
    } else {
        canvas_size
    }) * scale) as u32;
    if target_width == 0 || target_height == 0 {
        return;
    }
    let image = imageops::resize(
        &source,
        target_width,
        target_height,
        imageops::FilterType::Lanczos3,
    );
    let x = ((ICON_SOURCE_CANVAS_SIZE as i32 - target_width as i32) / 2)
        + (offset.x * canvas_size) as i32;
    let y = ((ICON_SOURCE_CANVAS_SIZE as i32 - target_height as i32) / 2)
        + (offset.y * canvas_size) as i32;
    imageops::overlay(canvas, &image, i64::from(x), i64::from(y));
}

fn write_desktop_icon(
    game_path: &Path,
    runtime_root: &Path,
    destination: &Path,
) -> AppResult<Option<PathBuf>> {
    let image = desktop_icon_from_source(game_path).or_else(|| {
        resolve_pc_icon(game_path, runtime_root).and_then(|path| image::open(path).ok())
    });
    let Some(image) = image else {
        return Ok(None);
    };
    let icon_path = destination.join("icon.png");
    image
        .resize_exact(512, 512, imageops::FilterType::Lanczos3)
        .save_with_format(&icon_path, image::ImageFormat::Png)
        .map_err(|error| export_error(format!("桌面图标生成失败: {error}")))?;
    Ok(Some(icon_path))
}

fn write_macos_icns(png_path: &Path, destination: &Path) -> AppResult<PathBuf> {
    let source = image::open(png_path)
        .map_err(|error| export_error(format!("桌面图标读取失败: {error}")))?;
    let mut family = icns::IconFamily::new();
    for size in [16, 32, 64, 128, 256, 512] {
        let image = source
            .resize_exact(size, size, imageops::FilterType::Lanczos3)
            .to_rgba8();
        let icon = icns::Image::from_data(icns::PixelFormat::RGBA, size, size, image.into_raw())
            .map_err(|error| export_error(format!("macOS 图标生成失败: {error}")))?;
        family
            .add_icon(&icon)
            .map_err(|error| export_error(format!("macOS 图标生成失败: {error}")))?;
    }
    let path = destination.join("icon.icns");
    family
        .write(BufWriter::new(fs::File::create(&path)?))
        .map_err(|error| export_error(format!("macOS 图标写入失败: {error}")))?;
    Ok(path)
}

fn replace_windows_icon(executable_path: &Path, icon_path: &Path) -> AppResult<()> {
    let mut executable = editpe::Image::parse_file(executable_path)
        .map_err(|error| export_error(format!("Windows 图标替换失败: {error}")))?;
    let mut resources = executable.resource_directory().cloned().unwrap_or_default();
    resources
        .set_main_icon_file(&icon_path.to_string_lossy())
        .map_err(|error| export_error(format!("Windows 图标替换失败: {error}")))?;
    executable
        .set_resource_directory(resources)
        .map_err(|error| export_error(format!("Windows 图标替换失败: {error}")))?;
    executable
        .write_file(executable_path)
        .map_err(|error| export_error(format!("Windows 图标替换失败: {error}")))
}

fn collect_files(
    root: &Path,
    current: &Path,
    files: &mut Vec<(PathBuf, PathBuf)>,
) -> AppResult<()> {
    let mut entries = fs::read_dir(current)?.collect::<Result<Vec<_>, _>>()?;
    entries.sort_by_key(fs::DirEntry::file_name);
    for entry in entries {
        let path = entry.path();
        let relative = path
            .strip_prefix(root)
            .map_err(|error| export_error(error.to_string()))?
            .to_path_buf();
        let file_type = entry.file_type()?;
        if file_type.is_symlink() {
            return Err(export_error("resources.neu 不支持符号链接"));
        }
        if file_type.is_dir() {
            collect_files(root, &path, files)?;
        } else if file_type.is_file() {
            files.push((path, relative));
        } else {
            return Err(export_error("resources.neu 包含不受支持的文件类型"));
        }
    }
    Ok(())
}

pub(super) fn export_pc_to_directory(
    request: PcExportRequest<'_>,
    mut report: impl FnMut(&str, u8) -> AppResult<()>,
) -> AppResult<()> {
    let PcExportRequest {
        engine_path,
        game_path,
        template_path,
        runtime_path,
        output_path,
        game_name,
        target_os,
        target_arch,
        window,
        replace_existing,
    } = request;
    if !engine_path.is_dir() {
        return Err(export_error("引擎目录不存在或不可访问"));
    }
    if !game_path.is_dir() {
        return Err(export_error("游戏目录不存在或不可访问"));
    }
    if template_path.is_some_and(|path| !path.is_dir()) {
        return Err(export_error("模板目录不存在或不可访问"));
    }
    if game_name.trim().is_empty() {
        return Err(export_error("游戏名称不能为空"));
    }
    if !runtime_path.is_file() {
        return Err(export_error("Neutralinojs 运行时不存在或不可访问"));
    }
    neutralino_runtime_entry(target_os, target_arch)?;
    if window.width < window.min_width
        || window.height < window.min_height
        || window.min_width == 0
        || window.min_height == 0
    {
        return Err(export_error("窗口尺寸配置无效"));
    }
    let cached = CachedCanonicals::compute(
        game_path.to_path_buf(),
        Some(engine_path.to_path_buf()),
        template_path.map(Path::to_path_buf),
    )?;
    let output_path = prepare_output_location(&cached, output_path)?;
    let output_exists = output_path.exists();
    if output_exists && !replace_existing {
        return Err(AppError::TargetConflict(output_path.display().to_string()));
    }
    if output_exists && !output_path.is_dir() {
        return Err(export_error("目标路径已存在且不是目录"));
    }
    if output_exists {
        let canonical_existing_output = output_path.canonicalize()?;
        if canonical_existing_output != output_path {
            return Err(export_error("已有目标目录是链接或已被重定向，不能安全覆盖"));
        }
        ensure_output_does_not_overlap_sources(&cached, &canonical_existing_output)?;
    }

    let parent = output_path
        .parent()
        .expect("validated output path should have parent");
    let work_directory = create_export_work_directory(parent)?;
    let site_root = work_directory.join("site");
    let staged_output = work_directory.join("next");
    let result = (|| {
        export_web_to_directory(
            engine_path,
            game_path,
            template_path,
            &site_root,
            game_name,
            false,
            |step, percentage| report(step, percentage.min(30)),
        )?;
        fs::create_dir(&staged_output)?;
        report(STEP_COPYING_RUNTIME, 32)?;
        let executable_stem = sanitize_desktop_name(game_name);
        let app_root = if target_os == "macos" {
            staged_output.join(format!("{executable_stem}.app/Contents"))
        } else {
            staged_output.clone()
        };
        let executable_directory = if target_os == "macos" {
            app_root.join("MacOS")
        } else {
            app_root.clone()
        };
        fs::create_dir_all(&executable_directory)?;
        let executable_name = if target_os == "windows" {
            format!("{executable_stem}.exe")
        } else {
            executable_stem.clone()
        };
        let executable_path = executable_directory.join(&executable_name);
        fs::copy(runtime_path, &executable_path)?;
        #[cfg(unix)]
        fs::set_permissions(&executable_path, fs::metadata(runtime_path)?.permissions())?;
        let resource_root = executable_directory.clone();
        fs::create_dir_all(&resource_root)?;
        let icon_root = if target_os == "macos" {
            app_root.join("Resources")
        } else {
            resource_root.clone()
        };
        fs::create_dir_all(&icon_root)?;
        let icon_path = write_desktop_icon(game_path, &site_root, &icon_root)?;
        if let Some(icon_path) = &icon_path {
            fs::copy(icon_path, site_root.join("icon.png"))?;
        }
        if target_os == "windows" {
            if let Some(icon_path) = &icon_path {
                replace_windows_icon(&executable_path, icon_path)?;
            }
        }
        if target_os == "macos" {
            if let Some(icon_path) = &icon_path {
                write_macos_icns(icon_path, &icon_root)?;
                fs::remove_file(icon_path)?;
            }
            write_macos_bundle_info(&app_root, game_name, &executable_name)?;
        }
        report(STEP_WRITING_CONFIG, 34)?;
        fs::write(site_root.join(NEUTRALINO_CLIENT_PATH), NEUTRALINO_CLIENT)?;
        fs::write(
            site_root.join(NEUTRALINO_CLIENT_LICENSE_PATH),
            NEUTRALINO_CLIENT_LICENSE,
        )?;
        fs::write(
            site_root.join(NEUTRALINO_FULLSCREEN_BRIDGE_PATH),
            NEUTRALINO_FULLSCREEN_BRIDGE,
        )?;
        let mut window_config = serde_json::json!({
            "title": game_name,
            "width": window.width,
            "height": window.height,
            "minWidth": window.min_width,
            "minHeight": window.min_height,
            "fullScreen": window.full_screen,
            "resizable": window.resizable,
            "injectClientLibrary": true,
            "injectScript": format!("/{NEUTRALINO_FULLSCREEN_BRIDGE_PATH}"),
        });
        if icon_path.is_some() {
            window_config["icon"] = serde_json::Value::String("/icon.png".into());
        }
        let config = serde_json::json!({
            "applicationId": format!("com.webgalcraft.{}", sanitize_application_id(game_name)),
            "defaultMode": "window",
            "enableServer": true,
            "enableNativeAPI": true,
            "tokenSecurity": "one-time",
            "nativeAllowList": [
                "window.setFullScreen",
                "window.exitFullScreen",
                "window.isFullScreen",
            ],
            "url": "/index.html",
            "modes": { "window": window_config },
            "cli": {
                "clientLibrary": format!("/{NEUTRALINO_CLIENT_PATH}"),
            },
        });
        let mut bytes =
            serde_json::to_vec_pretty(&config).map_err(|error| export_error(error.to_string()))?;
        bytes.push(b'\n');
        fs::write(site_root.join("neutralino.config.json"), bytes)?;
        package_resources(
            &site_root,
            &resource_root.join("resources.neu"),
            &mut report,
        )?;
        if target_os == "windows" || target_os == "linux" {
            if let Some(icon_path) = icon_path {
                fs::remove_file(icon_path)?;
            }
        }
        Ok(())
    })();

    if let Err(error) = result {
        cleanup_export_work_directory(&work_directory);
        return Err(error);
    }

    if output_exists {
        replace_output_directory(work_directory, &staged_output, &output_path)?;
    } else if let Err(error) = fs::rename(&staged_output, &output_path) {
        cleanup_export_work_directory(&work_directory);
        return Err(error.into());
    } else {
        cleanup_export_work_directory(&work_directory);
    }

    report(STEP_FINISHED, 100)
}

fn sanitize_application_id(value: &str) -> String {
    let mut result = String::new();
    for part in value.split(|character: char| !character.is_ascii_alphanumeric()) {
        if !part.is_empty() {
            result.push_str(&part.to_ascii_lowercase());
        }
    }
    if result.is_empty() {
        "game".into()
    } else {
        result
    }
}

fn sanitize_desktop_name(value: &str) -> String {
    let mut sanitized = value
        .chars()
        .map(|character| {
            if character.is_control()
                || matches!(
                    character,
                    '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                )
            {
                '_'
            } else {
                character
            }
        })
        .collect::<String>();
    sanitized = sanitized.trim().to_owned();
    while sanitized.ends_with([' ', '.']) {
        sanitized.pop();
    }
    if sanitized.is_empty() {
        sanitized.push_str("WebGAL Game");
    }
    if is_windows_reserved_name(&sanitized) {
        sanitized.push('_');
    }
    sanitized
}

fn is_windows_reserved_name(value: &str) -> bool {
    let stem = value.split('.').next().unwrap_or(value);
    matches!(
        stem.to_ascii_uppercase().as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}

fn write_macos_bundle_info(
    contents: &Path,
    game_name: &str,
    executable_name: &str,
) -> AppResult<()> {
    let escaped_name = game_name
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
    let escaped_executable_name = executable_name
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
    let bundle_identifier = format!("com.webgalcraft.{}", sanitize_application_id(game_name));
    let info = format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\"><dict><key>CFBundleDisplayName</key><string>{escaped_name}</string><key>CFBundleExecutable</key><string>{escaped_executable_name}</string><key>CFBundleIconFile</key><string>icon</string><key>CFBundleIdentifier</key><string>{bundle_identifier}</string><key>CFBundleName</key><string>{escaped_name}</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1.0.0</string></dict></plist>\n"
    );
    fs::write(contents.join("Info.plist"), info)?;
    Ok(())
}

pub(super) fn emit_web_export_progress(
    app: &AppHandle,
    export_id: &str,
    step: &str,
    percentage: u8,
) -> AppResult<()> {
    app.emit(
        "export-progress",
        ExportProgress {
            export_id: export_id.into(),
            platform: PLATFORM_WEB.into(),
            step: step.into(),
            percentage,
        },
    )?;
    Ok(())
}

fn collect_materialized_nodes(
    overlay: &OverlayFs,
    logical_path: &Path,
    nodes: &mut Vec<MaterializedNode>,
    active_directories: &mut HashSet<PathBuf>,
) -> AppResult<()> {
    let resolved = overlay.resolve_physical_path(logical_path)?;
    let metadata = fs::metadata(&resolved.physical_path)?;

    if metadata.is_dir() {
        let canonical_directory = resolved.physical_path.canonicalize()?;
        if !active_directories.insert(canonical_directory.clone()) {
            return Err(export_error(format!(
                "导出源目录包含循环链接: {}",
                logical_path.display()
            )));
        }

        nodes.push(MaterializedNode::Directory {
            logical_path: logical_path.to_path_buf(),
        });
        let result: AppResult<()> = (|| {
            for entry in overlay.list_entries(logical_path)? {
                collect_materialized_nodes(
                    overlay,
                    &logical_path.join(entry.name),
                    nodes,
                    active_directories,
                )?;
            }
            Ok(())
        })();
        active_directories.remove(&canonical_directory);
        result?;
    } else if metadata.is_file() {
        nodes.push(MaterializedNode::File {
            logical_path: logical_path.to_path_buf(),
        });
    }

    Ok(())
}

fn copy_materialized_group<F>(
    overlay: &OverlayFs,
    roots: &[VfsDirEntry],
    destination: &Path,
    step: &str,
    range: (u8, u8),
    report: &mut F,
) -> AppResult<()>
where
    F: FnMut(&str, u8) -> AppResult<()>,
{
    report(step, range.0)?;

    let mut nodes = Vec::new();
    let mut active_directories = HashSet::new();
    for root in roots {
        collect_materialized_nodes(
            overlay,
            Path::new(&root.name),
            &mut nodes,
            &mut active_directories,
        )?;
    }

    let total_files = nodes
        .iter()
        .filter(|node| matches!(node, MaterializedNode::File { .. }))
        .count();
    let mut copied_files = 0usize;
    let mut last_reported_percentage = range.0;

    for node in nodes {
        match node {
            MaterializedNode::Directory { logical_path } => {
                fs::create_dir_all(destination.join(logical_path))?;
            }
            MaterializedNode::File { logical_path } => {
                // 复制前重新校验物理路径，避免复用遍历阶段缓存的路径扩大 TOCTOU 窗口。
                let source_path = overlay.resolve_physical_path(&logical_path)?.physical_path;
                let destination_path = destination.join(logical_path);
                if let Some(parent) = destination_path.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::copy(source_path, destination_path)?;
                copied_files += 1;

                let span = usize::from(range.1 - range.0);
                let progress = usize::from(range.0) + span * copied_files / total_files;
                let percentage = progress as u8;
                if percentage > last_reported_percentage && percentage < range.1 {
                    report(step, percentage)?;
                    last_reported_percentage = percentage;
                }
            }
        }
    }

    report(step, range.1)
}

fn copy_web_icons<F>(
    overlay: &OverlayFs,
    destination: &Path,
    range: (u8, u8),
    report: &mut F,
) -> AppResult<()>
where
    F: FnMut(&str, u8) -> AppResult<()>,
{
    report(STEP_COPYING_ICONS, range.0)?;

    let icons_path = Path::new("icons");
    let icon_files = match overlay.list_entries(icons_path) {
        Ok(entries) => entries,
        Err(VfsError::NotFound) => Vec::new(),
        Err(VfsError::Io(error)) if error.kind() == ErrorKind::NotFound => Vec::new(),
        Err(error) => return Err(error.into()),
    }
    .into_iter()
    .filter(|entry| !entry.is_dir && WEB_ICON_FILE_NAMES.contains(&entry.name.as_str()))
    .collect::<Vec<_>>();
    let total_files = icon_files.len();
    let mut last_reported_percentage = range.0;

    for (index, entry) in icon_files.into_iter().enumerate() {
        let logical_path = icons_path.join(entry.name);
        let source_path = overlay.resolve_physical_path(&logical_path)?.physical_path;
        let destination_path = destination.join(&logical_path);
        if let Some(parent) = destination_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(source_path, destination_path)?;

        let span = usize::from(range.1 - range.0);
        let progress = usize::from(range.0) + span * (index + 1) / total_files;
        let percentage = progress as u8;
        if percentage > last_reported_percentage && percentage < range.1 {
            report(STEP_COPYING_ICONS, percentage)?;
            last_reported_percentage = percentage;
        }
    }

    report(STEP_COPYING_ICONS, range.1)
}

fn update_manifest(export_path: &Path, game_name: &str, game_description: &str) -> AppResult<()> {
    let manifest_path = export_path.join("manifest.json");
    let content = fs::read_to_string(&manifest_path)?;
    let mut manifest: serde_json::Value = serde_json::from_str(&content)
        .map_err(|error| export_error(format!("manifest.json 解析失败: {error}")))?;
    let object = manifest
        .as_object_mut()
        .ok_or_else(|| export_error("manifest.json 顶层必须是对象"))?;

    object.insert("name".into(), serde_json::Value::String(game_name.into()));
    object.insert(
        "short_name".into(),
        serde_json::Value::String(game_name.into()),
    );
    object.insert(
        "description".into(),
        serde_json::Value::String(game_description.into()),
    );

    let mut serialized = serde_json::to_vec_pretty(&manifest)
        .map_err(|error| export_error(format!("manifest.json 序列化失败: {error}")))?;
    serialized.push(b'\n');
    fs::write(manifest_path, serialized)?;
    Ok(())
}

fn split_root_entries(entries: Vec<VfsDirEntry>) -> (Vec<VfsDirEntry>, Vec<VfsDirEntry>) {
    let mut engine_entries = Vec::new();
    let mut game_entries = Vec::new();

    for entry in entries {
        match entry.name.as_str() {
            "game" => game_entries.push(entry),
            "icons" => {}
            _ => engine_entries.push(entry),
        }
    }

    (engine_entries, game_entries)
}

fn source_roots(cached: &CachedCanonicals) -> impl Iterator<Item = &Path> {
    [
        Some(cached.upper_canonical.as_path()),
        cached.engine_lower_canonical.as_deref(),
        cached.template_lower_canonical.as_deref(),
    ]
    .into_iter()
    .flatten()
}

fn ensure_path_is_outside_sources(cached: &CachedCanonicals, path: &Path) -> AppResult<()> {
    if source_roots(cached).any(|source_root| path.starts_with(source_root)) {
        return Err(export_error("导出目录不能位于游戏、引擎或模板源目录内部"));
    }

    Ok(())
}

fn ensure_output_does_not_overlap_sources(
    cached: &CachedCanonicals,
    output: &Path,
) -> AppResult<()> {
    if source_roots(cached)
        .any(|source_root| output.starts_with(source_root) || source_root.starts_with(output))
    {
        return Err(export_error("导出目录不能与游戏、引擎或模板源目录重叠"));
    }

    Ok(())
}

fn prepare_output_location(cached: &CachedCanonicals, output_path: &Path) -> AppResult<PathBuf> {
    let output_parent = output_path
        .parent()
        .ok_or_else(|| export_error("导出目录缺少父目录"))?;
    let output_name = output_path
        .file_name()
        .ok_or_else(|| export_error("导出目录名称无效"))?;

    if !output_parent.exists() {
        let existing_ancestor = output_parent
            .ancestors()
            .find(|ancestor| ancestor.exists())
            .ok_or_else(|| export_error("导出目录没有可访问的父目录"))?
            .canonicalize()?;
        ensure_path_is_outside_sources(cached, &existing_ancestor)?;
        fs::create_dir_all(output_parent)?;
    }

    let canonical_parent = output_parent.canonicalize()?;
    ensure_path_is_outside_sources(cached, &canonical_parent)?;
    let canonical_output = canonical_parent.join(output_name);

    ensure_output_does_not_overlap_sources(cached, &canonical_output)?;
    Ok(canonical_output)
}

fn validate_created_output_location(
    cached: &CachedCanonicals,
    output_path: &Path,
) -> AppResult<()> {
    // 创建后重新确认目录身份，防止父目录或目标被 reparse point 重定向。
    let canonical_output = output_path.canonicalize()?;
    if canonical_output != output_path {
        return Err(export_error("导出目录在创建后发生变化"));
    }

    ensure_output_does_not_overlap_sources(cached, &canonical_output)
}

fn create_export_work_directory(parent: &Path) -> AppResult<PathBuf> {
    for _ in 0..100 {
        let id = EXPORT_WORK_ID.fetch_add(1, Ordering::Relaxed);
        let path = parent.join(format!(".webgal-export-work-{}-{id}", std::process::id()));
        match fs::create_dir(&path) {
            Ok(()) => return Ok(path),
            Err(error) if error.kind() == ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error.into()),
        }
    }

    Err(export_error("无法创建唯一的导出工作目录"))
}

pub(super) fn cleanup_export_work_directory(work_directory: &Path) {
    if let Err(error) = fs::remove_dir_all(work_directory) {
        log::warn!(
            "清理 Web 导出工作目录失败: {} - {}",
            work_directory.display(),
            error
        );
    }
}

fn replace_output_directory(
    work_directory: PathBuf,
    staged_output: &Path,
    output_path: &Path,
) -> AppResult<()> {
    let backup_output = work_directory.join("previous");
    if let Err(error) = fs::rename(output_path, &backup_output) {
        cleanup_export_work_directory(&work_directory);
        return Err(error.into());
    }

    if let Err(replace_error) = fs::rename(staged_output, output_path) {
        match fs::rename(&backup_output, output_path) {
            Ok(()) => {
                cleanup_export_work_directory(&work_directory);
                return Err(replace_error.into());
            }
            Err(rollback_error) => {
                return Err(export_error(format!(
                    "替换已有导出失败且无法自动回滚；原导出保留在 {}：替换错误: {}；回滚错误: {}",
                    backup_output.display(),
                    replace_error,
                    rollback_error
                )));
            }
        }
    }

    cleanup_export_work_directory(&work_directory);
    Ok(())
}

pub(super) fn export_web_to_directory<F>(
    engine_path: &Path,
    game_path: &Path,
    template_path: Option<&Path>,
    output_path: &Path,
    game_name: &str,
    replace_existing: bool,
    mut report: F,
) -> AppResult<()>
where
    F: FnMut(&str, u8) -> AppResult<()>,
{
    if !engine_path.is_dir() {
        return Err(export_error("引擎目录不存在或不可访问"));
    }
    if !game_path.is_dir() {
        return Err(export_error("游戏目录不存在或不可访问"));
    }
    if template_path.is_some_and(|path| !path.is_dir()) {
        return Err(export_error("模板目录不存在或不可访问"));
    }
    if game_name.trim().is_empty() {
        return Err(export_error("游戏名称不能为空"));
    }

    let cached = CachedCanonicals::compute(
        game_path.to_path_buf(),
        Some(engine_path.to_path_buf()),
        template_path.map(Path::to_path_buf),
    )?;
    let output_path = prepare_output_location(&cached, output_path)?;
    let output_exists = output_path.exists();
    if output_exists && !replace_existing {
        return Err(AppError::TargetConflict(output_path.display().to_string()));
    }
    if output_exists && !output_path.is_dir() {
        return Err(export_error("目标路径已存在且不是目录"));
    }
    if output_exists {
        let canonical_existing_output = output_path.canonicalize()?;
        if canonical_existing_output != output_path {
            return Err(export_error("已有目标目录是链接或已被重定向，不能安全覆盖"));
        }
        ensure_output_does_not_overlap_sources(&cached, &canonical_existing_output)?;
    }

    let work_directory = output_exists
        .then(|| {
            create_export_work_directory(
                output_path
                    .parent()
                    .expect("validated output path should have parent"),
            )
        })
        .transpose()?;
    let materialized_output = work_directory
        .as_ref()
        .map_or_else(|| output_path.clone(), |work| work.join("next"));
    let overlay = OverlayFs::from_cached(&cached);
    let root_entries = overlay.list_entries(Path::new(""))?;
    let (engine_entries, game_entries) = split_root_entries(root_entries);

    match fs::create_dir(&materialized_output) {
        Ok(()) => {}
        Err(error) if error.kind() == ErrorKind::AlreadyExists => {
            if let Some(work_directory) = &work_directory {
                cleanup_export_work_directory(work_directory);
            }
            return Err(AppError::TargetConflict(
                materialized_output.display().to_string(),
            ));
        }
        Err(error) => {
            if let Some(work_directory) = &work_directory {
                cleanup_export_work_directory(work_directory);
            }
            return Err(error.into());
        }
    }

    let result = (|| {
        report(STEP_PREPARING, 5)?;
        validate_created_output_location(&cached, &materialized_output)?;
        copy_materialized_group(
            &overlay,
            &engine_entries,
            &materialized_output,
            STEP_COPYING_ENGINE,
            (10, 55),
            &mut report,
        )?;
        copy_materialized_group(
            &overlay,
            &game_entries,
            &materialized_output,
            STEP_COPYING_GAME,
            (55, 82),
            &mut report,
        )?;
        copy_web_icons(&overlay, &materialized_output, (82, 92), &mut report)?;

        report(STEP_UPDATING_MANIFEST, 95)?;
        let game_config = read_game_config(&materialized_output)?;
        let game_description = game_config
            .entries
            .into_iter()
            .find(|entry| entry.key == "Description")
            .map_or_else(String::new, |entry| entry.value);
        update_manifest(&materialized_output, game_name, &game_description)
    })();

    if result.is_err() {
        if let Some(work_directory) = &work_directory {
            cleanup_export_work_directory(work_directory);
        } else if let Err(error) = fs::remove_dir_all(&materialized_output) {
            log::warn!(
                "Web 导出失败后清理目标目录失败: {} - {}",
                materialized_output.display(),
                error
            );
        }
        return result;
    }

    if let Some(work_directory) = work_directory {
        replace_output_directory(work_directory, &materialized_output, &output_path)?;
    }

    report(STEP_FINISHED, 100)
}

#[expect(
    clippy::too_many_arguments,
    reason = "Tauri command parameters mirror the frontend invoke contract"
)]
#[tauri::command]
pub async fn export_web(
    app: AppHandle,
    export_id: String,
    engine_path: String,
    game_path: String,
    template_path: Option<String>,
    output_path: String,
    game_name: String,
    replace_existing: bool,
) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        export_web_to_directory(
            Path::new(&engine_path),
            Path::new(&game_path),
            template_path.as_deref().map(Path::new),
            Path::new(&output_path),
            &game_name,
            replace_existing,
            |step, percentage| emit_web_export_progress(&app, &export_id, step, percentage),
        )
    })
    .await
    .map_err(|error| export_error(format!("导出任务执行失败: {error}")))?
}

#[expect(
    clippy::too_many_arguments,
    reason = "Tauri command parameters mirror the frontend invoke contract"
)]
#[tauri::command]
pub async fn export_pc(
    app: AppHandle,
    export_id: String,
    engine_path: String,
    game_path: String,
    template_path: Option<String>,
    runtime_path: String,
    output_path: String,
    game_name: String,
    target_os: String,
    target_arch: String,
    window_config: PcWindowConfig,
    replace_existing: bool,
) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        export_pc_to_directory(
            PcExportRequest {
                engine_path: Path::new(&engine_path),
                game_path: Path::new(&game_path),
                template_path: template_path.as_deref().map(Path::new),
                runtime_path: Path::new(&runtime_path),
                output_path: Path::new(&output_path),
                game_name: &game_name,
                target_os: &target_os,
                target_arch: &target_arch,
                window: &window_config,
                replace_existing,
            },
            |step, percentage| {
                app.emit(
                    "export-progress",
                    ExportProgress {
                        export_id: export_id.clone(),
                        platform: pc_platform(&target_os, &target_arch)?,
                        step: step.into(),
                        percentage,
                    },
                )?;
                Ok(())
            },
        )
    })
    .await
    .map_err(|error| export_error(format!("导出任务执行失败: {error}")))?
}

#[tauri::command]
pub async fn ensure_pc_runtime(
    app: AppHandle,
    target_os: String,
    target_arch: String,
    proxy_prefix: Option<String>,
) -> AppResult<String> {
    let runtime_path = pc_runtime_cache_path(&app, &target_os, &target_arch)?;
    if runtime_path.is_file() {
        return Ok(runtime_path.to_string_lossy().into_owned());
    }

    let download_url = resolve_neutralino_runtime_url(proxy_prefix.as_deref())?;
    let response = reqwest::get(download_url)
        .await
        .map_err(|error| export_error(format!("运行时下载失败: {error}")))?
        .error_for_status()
        .map_err(|error| export_error(format!("运行时下载失败: {error}")))?;
    let archive = response
        .bytes()
        .await
        .map_err(|error| export_error(format!("运行时读取失败: {error}")))?;
    let entry_name = neutralino_runtime_entry(&target_os, &target_arch)?;
    let runtime = tauri::async_runtime::spawn_blocking(move || {
        extract_neutralino_runtime(&archive, entry_name)
    })
    .await
    .map_err(|error| export_error(format!("运行时解压任务执行失败: {error}")))??;
    let parent = runtime_path
        .parent()
        .expect("runtime cache path should have parent");
    if !parent.exists() {
        fs::create_dir_all(parent)?;
    }
    let temporary = runtime_path.with_extension("download");
    fs::write(&temporary, runtime)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&temporary, fs::Permissions::from_mode(0o755))?;
    }
    fs::rename(&temporary, &runtime_path)?;
    Ok(runtime_path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    #[cfg(windows)]
    use std::process::Command;
    use std::{fs, io::Write, path::Path};

    use super::{
        copy_web_icons, export_pc_to_directory, export_web_to_directory,
        extract_neutralino_runtime, neutralino_runtime_entry, resolve_neutralino_runtime_url,
        resolve_pc_icon, sanitize_desktop_name, AppError, CachedCanonicals, OverlayFs,
        PcExportRequest, PcWindowConfig, NEUTRALINO_RUNTIME_ARCHIVE_URL, STEP_COPYING_ICONS,
        STEP_COPYING_RUNTIME, STEP_FINISHED, STEP_PACKING_RESOURCES,
    };
    use serde_json::Value;
    use tempfile::tempdir;
    use zip::{write::SimpleFileOptions, ZipWriter};

    fn write_file(path: &Path, content: &str) {
        fs::create_dir_all(path.parent().expect("fixture file should have parent"))
            .expect("fixture parent should be created");
        fs::write(path, content).expect("fixture file should be written");
    }

    #[cfg(unix)]
    fn create_dir_link(target: &Path, link: &Path) {
        std::os::unix::fs::symlink(target, link).expect("directory symlink should be created");
    }

    #[cfg(windows)]
    fn create_dir_link(target: &Path, link: &Path) {
        let command = format!(
            "$link = '{}'; $target = '{}'; New-Item -ItemType Junction -Path $link -Target $target | Out-Null",
            link.display(),
            target.display(),
        );
        let status = Command::new("powershell")
            .args(["-NoProfile", "-Command", &command])
            .status()
            .expect("junction command should run");

        assert!(status.success(), "directory junction should be created");
    }

    fn create_export_fixture(root: &Path) {
        write_file(&root.join("engine/index.html"), "<html></html>");
        write_file(&root.join("engine/assets/runtime.js"), "runtime");
        write_file(
            &root.join("engine/manifest.json"),
            r##"{"name":"WebGAL","short_name":"WebGAL","description":"Engine default","theme_color":"#000000"}"##,
        );
        write_file(&root.join("engine/icons/favicon.ico"), "engine-icon");
        write_file(
            &root.join("engine/icons/nested/ignored.png"),
            "ignored-engine-icon",
        );
        write_file(&root.join("engine/icons/readme.txt"), "not-a-runtime-icon");
        write_file(
            &root.join("engine/game/template/engine-only.txt"),
            "engine-template",
        );

        write_file(&root.join("template/base.txt"), "template-base");
        write_file(&root.join("template/deleted.txt"), "deleted");
        write_file(&root.join("template/lower-only.txt"), "template-lower");

        write_file(
            &root.join("game/game/config.txt"),
            "Game_name: Demo;\nDescription: A visual novel;",
        );
        write_file(&root.join("game/game/scene/start.txt"), "say: hello;");
        write_file(&root.join("game/game/template/base.txt"), "upper-override");
        write_file(&root.join("game/icons/icon-192.png"), "project-icon");
        write_file(
            &root.join("game/icons/nested/ignored.png"),
            "ignored-project-icon",
        );
        write_file(
            &root.join("game/.webgalcraft/vfs/whiteouts/game/template/.wh.deleted.txt"),
            "",
        );
        write_file(&root.join("game/project.wgcp"), r#"{"version":1}"#);
    }

    fn create_icon_source_fixture(root: &Path, icon_shape: &str) {
        let source_root = root.join("game/.webgalcraft/icon-data");
        fs::create_dir_all(&source_root).expect("icon source directory should be created");
        let mut foreground = image::RgbaImage::from_pixel(100, 100, image::Rgba([255, 0, 0, 255]));
        for pixel in foreground.rows_mut() {
            for color in pixel.take(18) {
                *color = image::Rgba([0, 0, 255, 255]);
            }
        }
        foreground
            .save(source_root.join("foreground.png"))
            .expect("foreground source should be written");
        write_file(
            &source_root.join("state.json"),
            &format!(
                r##"{{"backgroundColor":"#FFFFFF","backgroundOffsetRatio":{{"x":0,"y":0}},"backgroundScale":1,"backgroundType":"color","foregroundOffsetRatio":{{"x":0,"y":0}},"foregroundScale":1,"iconShape":"{icon_shape}","version":1}}"##,
            ),
        );
    }

    fn assert_no_export_work_directories(parent: &Path) {
        let has_work_directory = fs::read_dir(parent)
            .expect("output parent should be readable")
            .flatten()
            .any(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".webgal-export-work-")
            });
        assert!(
            !has_work_directory,
            "export work directory should be cleaned"
        );
    }

    fn read_asar_file(archive: &[u8], path: &str) -> Option<Vec<u8>> {
        let header_size = u32::from_le_bytes(archive.get(12..16)?.try_into().ok()?) as usize;
        let aligned_header_size = (header_size + 3) & !3;
        let header: Value = serde_json::from_slice(archive.get(16..16 + header_size)?).ok()?;
        let mut entry = header.get("files")?;
        for (index, component) in path.split('/').enumerate() {
            entry = entry.get(component)?;
            if index + 1 < path.split('/').count() {
                entry = entry.get("files")?;
            }
        }
        let offset = entry.get("offset")?.as_str()?.parse::<usize>().ok()?;
        let size = entry.get("size")?.as_u64()? as usize;
        let start = 16 + aligned_header_size + offset;
        Some(archive.get(start..start + size)?.to_vec())
    }

    fn export_pc_fixture(root: &Path, target_os: &str, target_arch: &str, output: &Path) {
        let runtime = root.join("neutralino-runtime");
        write_file(&runtime, "runtime");
        export_pc_to_directory(
            PcExportRequest {
                engine_path: &root.join("engine"),
                game_path: &root.join("game"),
                template_path: Some(&root.join("template")),
                runtime_path: &runtime,
                output_path: output,
                game_name: "My Game",
                target_os,
                target_arch,
                window: &PcWindowConfig {
                    width: 1280,
                    height: 720,
                    min_width: 800,
                    min_height: 600,
                    full_screen: false,
                    resizable: true,
                },
                replace_existing: false,
            },
            |_, _| Ok(()),
        )
        .expect("pc export should succeed");
    }

    #[test]
    fn materializes_overlay_updates_manifest_and_reports_completion() {
        let root = tempdir().expect("temp root should be created");
        create_export_fixture(root.path());
        let output = root.path().join("output/Demo");
        fs::create_dir(root.path().join("output")).expect("output parent should be created");
        let mut progress = Vec::new();

        export_web_to_directory(
            &root.path().join("engine"),
            &root.path().join("game"),
            Some(&root.path().join("template")),
            &output,
            "My Game",
            false,
            |step, percentage| {
                progress.push((step.to_owned(), percentage));
                Ok(())
            },
        )
        .expect("web export should succeed");

        assert_eq!(
            fs::read_to_string(output.join("assets/runtime.js")).unwrap(),
            "runtime"
        );
        assert_eq!(
            fs::read_to_string(output.join("game/config.txt")).unwrap(),
            "Game_name: Demo;\nDescription: A visual novel;"
        );
        assert_eq!(
            fs::read_to_string(output.join("game/template/base.txt")).unwrap(),
            "upper-override"
        );
        assert_eq!(
            fs::read_to_string(output.join("game/template/lower-only.txt")).unwrap(),
            "template-lower"
        );
        assert!(!output.join("game/template/deleted.txt").exists());
        assert!(!output.join("game/template/engine-only.txt").exists());
        assert_eq!(
            fs::read_to_string(output.join("icons/favicon.ico")).unwrap(),
            "engine-icon"
        );
        assert_eq!(
            fs::read_to_string(output.join("icons/icon-192.png")).unwrap(),
            "project-icon"
        );
        assert!(!output.join("icons/nested").exists());
        assert!(!output.join("icons/readme.txt").exists());
        assert!(!output.join("project.wgcp").exists());
        assert!(!output.join(".webgalcraft").exists());

        let manifest: Value =
            serde_json::from_str(&fs::read_to_string(output.join("manifest.json")).unwrap())
                .unwrap();
        assert_eq!(manifest["name"], "My Game");
        assert_eq!(manifest["short_name"], "My Game");
        assert_eq!(manifest["description"], "A visual novel");
        assert_eq!(manifest["theme_color"], "#000000");
        assert_eq!(progress.last(), Some(&(STEP_FINISHED.to_owned(), 100)));
        assert!(progress.windows(2).all(|pair| pair[0] != pair[1]));
    }

    #[test]
    fn exports_without_an_icons_directory() {
        let root = tempdir().expect("temp root should be created");
        create_export_fixture(root.path());
        fs::remove_dir_all(root.path().join("engine/icons"))
            .expect("engine icons should be removed");
        fs::remove_dir_all(root.path().join("game/icons")).expect("game icons should be removed");
        let output = root.path().join("output/Demo");

        export_web_to_directory(
            &root.path().join("engine"),
            &root.path().join("game"),
            Some(&root.path().join("template")),
            &output,
            "My Game",
            false,
            |_, _| Ok(()),
        )
        .expect("web export should succeed without icons");

        assert!(!output.join("icons").exists());
    }

    #[test]
    fn reports_icon_progress_only_when_percentage_increases() {
        let root = tempdir().expect("temp root should be created");
        create_export_fixture(root.path());
        for name in [
            "apple-touch-icon.png",
            "icon-192-maskable.png",
            "icon-512-maskable.png",
            "icon-512.png",
        ] {
            write_file(&root.path().join("game/icons").join(name), "project-icon");
        }

        let cached = CachedCanonicals::compute(
            root.path().join("game"),
            Some(root.path().join("engine")),
            Some(root.path().join("template")),
        )
        .expect("fixture paths should be canonicalized");
        let overlay = OverlayFs::from_cached(&cached);
        let destination = root.path().join("output");
        fs::create_dir(&destination).expect("output directory should be created");
        let mut progress = Vec::new();

        copy_web_icons(&overlay, &destination, (82, 84), &mut |step, percentage| {
            progress.push((step.to_owned(), percentage));
            Ok(())
        })
        .expect("icon copy should succeed");

        assert_eq!(
            progress,
            vec![
                (STEP_COPYING_ICONS.to_owned(), 82),
                (STEP_COPYING_ICONS.to_owned(), 83),
                (STEP_COPYING_ICONS.to_owned(), 84),
            ]
        );
    }

    #[test]
    fn creates_missing_output_parent_directories() {
        let root = tempdir().expect("temp root should be created");
        create_export_fixture(root.path());
        let output = root.path().join("new/output/root/Demo");

        export_web_to_directory(
            &root.path().join("engine"),
            &root.path().join("game"),
            Some(&root.path().join("template")),
            &output,
            "My Game",
            false,
            |_, _| Ok(()),
        )
        .expect("web export should create a missing output root");

        assert!(output.join("index.html").is_file());
        assert!(output.join("game/config.txt").is_file());
    }

    #[test]
    fn rejects_directory_link_cycles_in_export_sources() {
        let root = tempdir().expect("temp root should be created");
        create_export_fixture(root.path());
        create_dir_link(
            &root.path().join("game/game"),
            &root.path().join("game/game/loop"),
        );
        let output = root.path().join("output/Demo");

        let error = export_web_to_directory(
            &root.path().join("engine"),
            &root.path().join("game"),
            Some(&root.path().join("template")),
            &output,
            "My Game",
            false,
            |_, _| Ok(()),
        )
        .expect_err("directory cycles should be rejected");

        assert!(matches!(error, AppError::Export(message) if message.contains("循环链接")));
        assert!(!output.exists());
    }

    #[test]
    fn refuses_to_overwrite_an_existing_output_directory() {
        let root = tempdir().expect("temp root should be created");
        create_export_fixture(root.path());
        let output = root.path().join("output/Demo");
        write_file(&output.join("keep.txt"), "keep");
        let mut progress = Vec::new();

        let error = export_web_to_directory(
            &root.path().join("engine"),
            &root.path().join("game"),
            Some(&root.path().join("template")),
            &output,
            "My Game",
            false,
            |step, percentage| {
                progress.push((step.to_owned(), percentage));
                Ok(())
            },
        )
        .expect_err("existing output should be rejected");

        assert!(matches!(error, AppError::TargetConflict(path) if path.ends_with("Demo")));
        assert!(progress.is_empty());
        assert_eq!(fs::read_to_string(output.join("keep.txt")).unwrap(), "keep");
    }

    #[test]
    fn replaces_an_existing_output_directory_without_merging_old_files() {
        let root = tempdir().expect("temp root should be created");
        create_export_fixture(root.path());
        let output = root.path().join("output/Demo");
        write_file(&output.join("old-only.txt"), "old");

        export_web_to_directory(
            &root.path().join("engine"),
            &root.path().join("game"),
            Some(&root.path().join("template")),
            &output,
            "My Game",
            true,
            |_, _| Ok(()),
        )
        .expect("confirmed replacement should succeed");

        assert!(output.join("index.html").is_file());
        assert!(!output.join("old-only.txt").exists());
        assert_no_export_work_directories(output.parent().unwrap());
    }

    #[test]
    fn preserves_existing_output_when_replacement_export_fails() {
        let root = tempdir().expect("temp root should be created");
        create_export_fixture(root.path());
        write_file(&root.path().join("engine/manifest.json"), "not json");
        let output = root.path().join("output/Demo");
        write_file(&output.join("index.html"), "old export");

        let error = export_web_to_directory(
            &root.path().join("engine"),
            &root.path().join("game"),
            Some(&root.path().join("template")),
            &output,
            "My Game",
            true,
            |_, _| Ok(()),
        )
        .expect_err("failed replacement should keep the existing output");

        assert!(matches!(error, AppError::Export(message) if message.contains("manifest.json")));
        assert_eq!(
            fs::read_to_string(output.join("index.html")).unwrap(),
            "old export"
        );
        assert_no_export_work_directories(output.parent().unwrap());
    }

    #[test]
    fn removes_new_output_directory_when_manifest_is_invalid() {
        let root = tempdir().expect("temp root should be created");
        create_export_fixture(root.path());
        write_file(&root.path().join("engine/manifest.json"), "not json");
        let output = root.path().join("output/Demo");
        fs::create_dir(root.path().join("output")).expect("output parent should be created");

        let error = export_web_to_directory(
            &root.path().join("engine"),
            &root.path().join("game"),
            Some(&root.path().join("template")),
            &output,
            "My Game",
            false,
            |_, _| Ok(()),
        )
        .expect_err("invalid manifest should fail");

        assert!(matches!(error, AppError::Export(message) if message.contains("manifest.json")));
        assert!(!output.exists());
    }

    #[test]
    fn rejects_output_directories_nested_inside_export_sources() {
        let root = tempdir().expect("temp root should be created");
        create_export_fixture(root.path());
        let source_nested_outputs = [
            root.path().join("game/game/Export"),
            root.path().join("engine/assets/Export"),
            root.path().join("template/Export"),
        ];

        for output in source_nested_outputs {
            let error = export_web_to_directory(
                &root.path().join("engine"),
                &root.path().join("game"),
                Some(&root.path().join("template")),
                &output,
                "My Game",
                false,
                |_, _| Ok(()),
            )
            .expect_err("source-nested output should be rejected");

            assert!(matches!(error, AppError::Export(message) if message.contains("源目录")));
            assert!(!output.exists());
        }
    }

    #[test]
    fn rejects_output_directories_that_contain_export_sources() {
        let root = tempdir().expect("temp root should be created");
        create_export_fixture(root.path());

        let error = export_web_to_directory(
            &root.path().join("engine"),
            &root.path().join("game"),
            Some(&root.path().join("template")),
            root.path(),
            "My Game",
            true,
            |_, _| Ok(()),
        )
        .expect_err("source-containing output should be rejected");

        assert!(matches!(error, AppError::Export(message) if message.contains("源目录重叠")));
        assert!(root.path().join("game/game/config.txt").is_file());
        assert!(root.path().join("engine/index.html").is_file());
    }

    #[test]
    fn does_not_create_missing_output_parents_inside_sources() {
        let root = tempdir().expect("temp root should be created");
        create_export_fixture(root.path());
        let output_parent = root.path().join("game/game/new/exports");
        let output = output_parent.join("Demo");

        let error = export_web_to_directory(
            &root.path().join("engine"),
            &root.path().join("game"),
            Some(&root.path().join("template")),
            &output,
            "My Game",
            false,
            |_, _| Ok(()),
        )
        .expect_err("source-nested output should be rejected before creating its parent");

        assert!(matches!(error, AppError::Export(message) if message.contains("源目录内部")));
        assert!(!output_parent.exists());
    }

    #[test]
    fn exports_pc_runtime_resources_and_neutralino_config() {
        let root = tempdir().expect("temp root should be created");
        create_export_fixture(root.path());
        let output = root.path().join("output/Demo/windows");
        export_pc_fixture(root.path(), "windows", "x64", &output);
        assert_eq!(
            fs::read_to_string(output.join("My Game.exe")).unwrap(),
            "runtime"
        );
        let bundle = fs::read(output.join("resources.neu")).unwrap();
        assert_eq!(
            read_asar_file(&bundle, "index.html"),
            Some(b"<html></html>".to_vec())
        );
        assert_eq!(
            read_asar_file(&bundle, "game/config.txt"),
            Some(b"Game_name: Demo;\nDescription: A visual novel;".to_vec())
        );
        let config: Value =
            serde_json::from_slice(&read_asar_file(&bundle, "neutralino.config.json").unwrap())
                .unwrap();
        assert_eq!(config["enableServer"], true);
        assert_eq!(config["enableNativeAPI"], true);
        assert_eq!(config["tokenSecurity"], "one-time");
        assert_eq!(
            config["nativeAllowList"],
            serde_json::json!([
                "window.setFullScreen",
                "window.exitFullScreen",
                "window.isFullScreen",
            ])
        );
        assert_eq!(config["modes"]["window"]["width"], 1280);
        assert_eq!(config["modes"]["window"]["injectClientLibrary"], true);
        assert_eq!(
            config["modes"]["window"]["injectScript"],
            "/webgalcraft-neutralino-fullscreen.js"
        );
        assert_eq!(config["cli"]["clientLibrary"], "/webgalcraft-neutralino.js");
        assert!(read_asar_file(&bundle, "webgalcraft-neutralino.js").is_some());
        assert!(read_asar_file(&bundle, "webgalcraft-neutralino-LICENSE.txt").is_some());
        assert!(read_asar_file(&bundle, "webgalcraft-neutralino-fullscreen.js").is_some());
    }

    #[test]
    fn reports_pc_export_progress_monotonically() {
        let root = tempdir().expect("temp root should be created");
        create_export_fixture(root.path());
        let runtime = root.path().join("neutralino-runtime");
        write_file(&runtime, "runtime");
        let output = root.path().join("output/Demo/windows");
        let mut progress = Vec::new();

        export_pc_to_directory(
            PcExportRequest {
                engine_path: &root.path().join("engine"),
                game_path: &root.path().join("game"),
                template_path: Some(&root.path().join("template")),
                runtime_path: &runtime,
                output_path: &output,
                game_name: "My Game",
                target_os: "windows",
                target_arch: "x64",
                window: &PcWindowConfig {
                    width: 1280,
                    height: 720,
                    min_width: 800,
                    min_height: 600,
                    full_screen: false,
                    resizable: true,
                },
                replace_existing: false,
            },
            |step, percentage| {
                progress.push((step.to_owned(), percentage));
                Ok(())
            },
        )
        .expect("pc export should succeed");

        let runtime_index = progress
            .iter()
            .position(|(step, _)| step == STEP_COPYING_RUNTIME)
            .expect("runtime copy progress should be reported");
        let packing_index = progress
            .iter()
            .position(|(step, _)| step == STEP_PACKING_RESOURCES)
            .expect("resource packing progress should be reported");
        assert!(runtime_index < packing_index);
        assert!(
            progress.windows(2).all(|pair| pair[0].1 <= pair[1].1),
            "desktop export progress should not move backwards: {progress:?}",
        );
        assert_eq!(progress.last(), Some(&(STEP_FINISHED.to_owned(), 100)));
    }

    #[test]
    fn exports_linux_icon_inside_resources_archive() {
        let root = tempdir().expect("temp root should be created");
        create_export_fixture(root.path());
        let icon = image::RgbaImage::from_pixel(16, 16, image::Rgba([1, 2, 3, 255]));
        icon.save(root.path().join("game/icons/icon-192.png"))
            .expect("fixture icon should be written");
        let output = root.path().join("output/Demo/linux");

        export_pc_fixture(root.path(), "linux", "x64", &output);

        assert_eq!(
            fs::read_to_string(output.join("My Game")).unwrap(),
            "runtime"
        );
        let bundle = fs::read(output.join("resources.neu")).unwrap();
        assert!(read_asar_file(&bundle, "icon.png").is_some());
        let config: Value =
            serde_json::from_slice(&read_asar_file(&bundle, "neutralino.config.json").unwrap())
                .unwrap();
        assert_eq!(config["modes"]["window"]["icon"], "/icon.png");
        assert!(!output.join("icon.png").exists());
    }

    #[test]
    fn falls_back_to_runtime_default_icon_when_project_has_no_icon() {
        let root = tempdir().expect("temp root should be created");
        create_export_fixture(root.path());
        fs::remove_dir_all(root.path().join("game/icons"))
            .expect("project icons should be removed");
        let runtime_icon = image::RgbaImage::from_pixel(16, 16, image::Rgba([12, 34, 56, 255]));
        runtime_icon
            .save(root.path().join("engine/icons/icon-512.png"))
            .expect("runtime default icon should be written");
        let output = root.path().join("output/Demo/linux");

        export_pc_fixture(root.path(), "linux", "x64", &output);

        let bundle = fs::read(output.join("resources.neu")).unwrap();
        let icon = image::load_from_memory(
            &read_asar_file(&bundle, "icon.png").expect("default icon should be packaged"),
        )
        .expect("default icon should be a PNG")
        .to_rgba8();
        assert_eq!(icon.get_pixel(0, 0).0, [12, 34, 56, 255]);
    }

    #[test]
    fn generates_desktop_icon_from_editor_source() {
        let root = tempdir().expect("temp root should be created");
        create_export_fixture(root.path());
        create_icon_source_fixture(root.path(), "square");
        let square_output = root.path().join("output/Demo/linux-square");

        export_pc_fixture(root.path(), "linux", "x64", &square_output);

        let bundle = fs::read(square_output.join("resources.neu")).unwrap();
        let icon = image::load_from_memory(
            &read_asar_file(&bundle, "icon.png").expect("desktop icon should be packaged"),
        )
        .expect("desktop icon should be a PNG")
        .to_rgba8();
        let left_edge = icon.get_pixel(0, icon.height() / 2);
        assert!(
            left_edge[0] > 200 && left_edge[2] < 50,
            "desktop crop should remove the blue full-bleed edge, got {left_edge:?}",
        );

        create_icon_source_fixture(root.path(), "circle");
        let circle_output = root.path().join("output/Demo/linux-circle");
        export_pc_fixture(root.path(), "linux", "x64", &circle_output);
        let bundle = fs::read(circle_output.join("resources.neu")).unwrap();
        let icon = image::load_from_memory(
            &read_asar_file(&bundle, "icon.png").expect("desktop icon should be packaged"),
        )
        .expect("desktop icon should be a PNG")
        .to_rgba8();
        assert_eq!(icon.get_pixel(0, 0)[3], 0);
        assert_eq!(icon.get_pixel(icon.width() / 2, icon.height() / 2)[3], 255);
    }

    #[test]
    fn exports_macos_application_bundle_with_icns() {
        let root = tempdir().expect("temp root should be created");
        create_export_fixture(root.path());
        let icon = image::RgbaImage::from_pixel(16, 16, image::Rgba([1, 2, 3, 255]));
        icon.save(root.path().join("game/icons/icon-192.png"))
            .expect("fixture icon should be written");
        let output = root.path().join("output/Demo/macos");

        export_pc_fixture(root.path(), "macos", "arm64", &output);

        let contents = output.join("My Game.app/Contents");
        assert_eq!(
            fs::read_to_string(contents.join("MacOS/My Game")).unwrap(),
            "runtime"
        );
        assert!(contents.join("Resources/icon.icns").is_file());
        let info = fs::read_to_string(contents.join("Info.plist")).unwrap();
        assert!(info.contains("<key>CFBundleExecutable</key><string>My Game</string>"));
        assert!(info.contains("My Game"));
        assert!(read_asar_file(
            &fs::read(contents.join("MacOS/resources.neu")).unwrap(),
            "index.html"
        )
        .is_some());
        let bundle = fs::read(contents.join("MacOS/resources.neu")).unwrap();
        assert!(read_asar_file(&bundle, "icon.png").is_some());
        let config: Value =
            serde_json::from_slice(&read_asar_file(&bundle, "neutralino.config.json").unwrap())
                .unwrap();
        assert_eq!(config["modes"]["window"]["icon"], "/icon.png");
    }

    #[test]
    fn resolves_desktop_icon_using_documented_fallback_order() {
        let root = tempdir().expect("temp root should be created");
        let icons = root.path().join("game/icons");
        let runtime_root = root.path().join("runtime");
        write_file(&icons.join("favicon.ico"), "favicon");
        write_file(&icons.join("apple-touch-icon.png"), "apple");
        write_file(&icons.join("icon-192.png"), "192");
        write_file(&icons.join("icon-512.png"), "512");
        write_file(&runtime_root.join("icons/icon-512.png"), "runtime");

        assert_eq!(
            resolve_pc_icon(&root.path().join("game"), &runtime_root),
            Some(icons.join("icon-512.png"))
        );
        fs::remove_file(icons.join("icon-512.png")).unwrap();
        assert_eq!(
            resolve_pc_icon(&root.path().join("game"), &runtime_root),
            Some(icons.join("icon-192.png"))
        );
        fs::remove_dir_all(&icons).unwrap();
        assert_eq!(
            resolve_pc_icon(&root.path().join("game"), &runtime_root),
            Some(runtime_root.join("icons/icon-512.png"))
        );
    }

    #[test]
    fn sanitizes_desktop_names_for_all_export_targets() {
        assert_eq!(sanitize_desktop_name("  My:Game. "), "My_Game");
        assert_eq!(sanitize_desktop_name("CON"), "CON_");
        assert_eq!(sanitize_desktop_name("   ..."), "WebGAL Game");
        assert_eq!(sanitize_desktop_name("A/B\\C"), "A_B_C");
    }

    #[test]
    fn extracts_only_requested_runtime_from_archive() {
        let bytes = Vec::new();
        let mut archive = ZipWriter::new(std::io::Cursor::new(bytes));
        archive
            .start_file("neutralino-win_x64.exe", SimpleFileOptions::default())
            .unwrap();
        archive.write_all(b"windows").unwrap();
        archive
            .start_file("neutralino-mac_arm64", SimpleFileOptions::default())
            .unwrap();
        archive.write_all(b"macos").unwrap();
        let bytes = archive.finish().unwrap().into_inner();

        assert_eq!(
            extract_neutralino_runtime(&bytes, "neutralino-mac_arm64").unwrap(),
            b"macos"
        );
        assert!(extract_neutralino_runtime(&bytes, "neutralino-linux_x64").is_err());
    }

    #[test]
    fn maps_supported_neutralino_runtime_targets() {
        assert_eq!(
            neutralino_runtime_entry("windows", "x64").unwrap(),
            "neutralino-win_x64.exe"
        );
        assert_eq!(
            neutralino_runtime_entry("macos", "x64").unwrap(),
            "neutralino-mac_x64"
        );
        assert_eq!(
            neutralino_runtime_entry("macos", "arm64").unwrap(),
            "neutralino-mac_arm64"
        );
        assert_eq!(
            neutralino_runtime_entry("linux", "x64").unwrap(),
            "neutralino-linux_x64"
        );
        assert!(neutralino_runtime_entry("windows", "arm64").is_err());
    }

    #[test]
    fn resolves_neutralino_runtime_url_through_an_https_proxy_prefix() {
        assert_eq!(
            resolve_neutralino_runtime_url(Some("https://proxy.example/"))
                .expect("proxy URL should be accepted"),
            "https://proxy.example/https://github.com/neutralinojs/neutralinojs/releases/download/v6.9.0/neutralinojs-v6.9.0.zip"
        );
        assert_eq!(
            resolve_neutralino_runtime_url(Some("https://proxy.example"))
                .expect("proxy URL without a trailing slash should be accepted"),
            "https://proxy.example/https://github.com/neutralinojs/neutralinojs/releases/download/v6.9.0/neutralinojs-v6.9.0.zip"
        );
        assert_eq!(
            resolve_neutralino_runtime_url(None).unwrap(),
            NEUTRALINO_RUNTIME_ARCHIVE_URL
        );
    }

    #[test]
    fn rejects_insecure_or_credentialed_neutralino_runtime_proxy_urls() {
        for proxy in [
            "http://proxy.example/",
            "https://user:password@proxy.example/",
            "https://proxy.example/?token=secret",
        ] {
            let error = resolve_neutralino_runtime_url(Some(proxy))
                .expect_err("unsafe proxy URL should be rejected");
            assert!(error.to_string().contains("HTTPS"));
        }
    }
}
