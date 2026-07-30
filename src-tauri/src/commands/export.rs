use std::{
    collections::HashSet,
    fs,
    io::{ErrorKind, Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use zip::{write::SimpleFileOptions, ZipWriter};

use super::{game::read_game_config, AppError, AppResult};
use crate::vfs::{CachedCanonicals, OverlayFs, VfsDirEntry, VfsError};

const PLATFORM_WEB: &str = "web";
const STEP_PREPARING: &str = "export.progress.preparing";
const STEP_COPYING_ENGINE: &str = "export.progress.copyingEngine";
const STEP_COPYING_GAME: &str = "export.progress.copyingGame";
const STEP_COPYING_ICONS: &str = "export.progress.copyingIcons";
const STEP_UPDATING_MANIFEST: &str = "export.progress.updatingManifest";
const STEP_FINISHED: &str = "export.progress.finished";
const STEP_COMPRESSING: &str = "export.progress.compressing";
const WEB_ICON_FILE_NAMES: [&str; 6] = [
    "apple-touch-icon.png",
    "favicon.ico",
    "icon-192-maskable.png",
    "icon-192.png",
    "icon-512-maskable.png",
    "icon-512.png",
];
static EXPORT_WORK_ID: AtomicU64 = AtomicU64::new(0);

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

fn export_error(message: impl Into<String>) -> AppError {
    AppError::Export(message.into())
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

fn cleanup_export_work_directory(work_directory: &Path) {
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

fn export_web_to_directory<F>(
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
            |step, percentage| {
                app.emit(
                    "export-progress",
                    ExportProgress {
                        export_id: export_id.clone(),
                        platform: PLATFORM_WEB.into(),
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

fn validate_export_session_id(session_id: &str) -> AppResult<()> {
    if session_id.is_empty()
        || session_id == "."
        || session_id == ".."
        || !session_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err(export_error("无效的导出会话 ID"));
    }
    Ok(())
}

fn android_export_session_directory(app: &AppHandle, session_id: &str) -> AppResult<PathBuf> {
    validate_export_session_id(session_id)?;
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| export_error(format!("无法解析应用数据目录: {error}")))?
        .join("documents/WebGALCraft/exports/.export-staging");
    Ok(root.join(session_id))
}

fn collect_zip_entries(directory: &Path, entries: &mut Vec<PathBuf>) -> AppResult<()> {
    let mut children = fs::read_dir(directory)?.collect::<Result<Vec<_>, _>>()?;
    children.sort_by_key(std::fs::DirEntry::file_name);
    for child in children {
        let path = child.path();
        let file_type = child.file_type()?;
        if file_type.is_symlink() {
            return Err(export_error("导出产物包含不受支持的符号链接"));
        }
        entries.push(path.clone());
        if file_type.is_dir() {
            collect_zip_entries(&path, entries)?;
        } else if !file_type.is_file() {
            return Err(export_error("导出产物包含不受支持的文件类型"));
        }
    }
    Ok(())
}

fn zip_directory(source: &Path, destination: &Path) -> AppResult<()> {
    let file = fs::File::create(destination)?;
    let mut archive = ZipWriter::new(file);
    let options = SimpleFileOptions::default();
    let mut entries = Vec::new();
    collect_zip_entries(source, &mut entries)?;

    for path in entries {
        let relative = path
            .strip_prefix(source)
            .map_err(|error| export_error(format!("无法生成 ZIP 相对路径: {error}")))?;
        let name = relative.to_string_lossy().replace('\\', "/");
        if path.is_dir() {
            archive
                .add_directory(format!("{name}/"), options)
                .map_err(|error| export_error(format!("写入 ZIP 目录失败: {error}")))?;
            continue;
        }

        archive
            .start_file(name, options)
            .map_err(|error| export_error(format!("写入 ZIP 文件失败: {error}")))?;
        let mut input = fs::File::open(path)?;
        let mut buffer = [0_u8; 64 * 1024];
        loop {
            let read = input.read(&mut buffer)?;
            if read == 0 {
                break;
            }
            archive
                .write_all(&buffer[..read])
                .map_err(|error| export_error(format!("写入 ZIP 数据失败: {error}")))?;
        }
    }

    archive
        .finish()
        .map_err(|error| export_error(format!("完成 ZIP 失败: {error}")))?;
    Ok(())
}

#[tauri::command]
pub async fn export_android_web_zip(
    app: AppHandle,
    export_id: String,
    export_session_id: String,
    engine_path: String,
    game_path: String,
    template_path: Option<String>,
    game_name: String,
) -> AppResult<()> {
    let session_directory = android_export_session_directory(&app, &export_session_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        if session_directory.exists() {
            return Err(AppError::TargetConflict(
                session_directory.display().to_string(),
            ));
        }
        fs::create_dir_all(&session_directory)?;
        let web_directory = session_directory.join("web");
        let result = (|| {
            export_web_to_directory(
                Path::new(&engine_path),
                Path::new(&game_path),
                template_path.as_deref().map(Path::new),
                &web_directory,
                &game_name,
                false,
                |step, percentage| {
                    let (step, percentage) = if step == STEP_FINISHED {
                        (STEP_COMPRESSING, 96)
                    } else {
                        (step, percentage.min(95))
                    };
                    app.emit(
                        "export-progress",
                        ExportProgress {
                            export_id: export_id.clone(),
                            platform: PLATFORM_WEB.into(),
                            step: step.into(),
                            percentage,
                        },
                    )?;
                    Ok(())
                },
            )?;
            zip_directory(&web_directory, &session_directory.join("export.zip"))?;
            app.emit(
                "export-progress",
                ExportProgress {
                    export_id,
                    platform: PLATFORM_WEB.into(),
                    step: STEP_FINISHED.into(),
                    percentage: 100,
                },
            )?;
            Ok(())
        })();
        if result.is_err() {
            cleanup_export_work_directory(&session_directory);
        }
        result
    })
    .await
    .map_err(|error| export_error(format!("导出任务执行失败: {error}")))?
}

#[tauri::command]
pub async fn cleanup_android_web_export(
    app: AppHandle,
    export_session_id: String,
) -> AppResult<()> {
    let session_directory = android_export_session_directory(&app, &export_session_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        if session_directory.exists() {
            fs::remove_dir_all(session_directory)?;
        }
        Ok(())
    })
    .await
    .map_err(|error| export_error(format!("清理导出任务失败: {error}")))?
}

#[cfg(test)]
mod tests {
    #[cfg(windows)]
    use std::process::Command;
    use std::{fs, io::Read, path::Path};

    use serde_json::Value;
    use tempfile::tempdir;
    use zip::ZipArchive;

    #[cfg(unix)]
    use super::collect_zip_entries;
    use super::{
        copy_web_icons, export_web_to_directory, validate_export_session_id, zip_directory,
        AppError, CachedCanonicals, OverlayFs, STEP_COPYING_ICONS, STEP_FINISHED,
    };

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
    fn validates_android_export_session_ids() {
        assert!(validate_export_session_id("2ee2f25e-4425-4ca8-9240-8ca79ee0b09b").is_ok());
        for invalid in ["", ".", "..", "../other", "other/session", "other\\session"] {
            assert!(validate_export_session_id(invalid).is_err(), "{invalid}");
        }
    }

    #[test]
    fn creates_zip_with_relative_directory_structure() {
        let root = tempdir().expect("temp root should be created");
        let source = root.path().join("web");
        fs::create_dir_all(source.join("assets/images")).expect("nested source should be created");
        fs::write(source.join("index.html"), "index").expect("root file should be created");
        fs::write(source.join("assets/images/cover.txt"), "cover")
            .expect("nested file should be created");
        let destination = root.path().join("export.zip");

        zip_directory(&source, &destination).expect("zip should be created");

        let file = fs::File::open(destination).expect("zip should open");
        let mut archive = ZipArchive::new(file).expect("zip should parse");
        let mut index = String::new();
        archive
            .by_name("index.html")
            .expect("root file should exist")
            .read_to_string(&mut index)
            .expect("root file should read");
        assert_eq!(index, "index");
        assert!(archive.by_name("assets/images/cover.txt").is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symbolic_links_in_zip_source() {
        use std::os::unix::fs::symlink;

        let root = tempdir().expect("temp root should be created");
        let source = root.path().join("web");
        fs::create_dir_all(&source).expect("source should be created");
        let outside = root.path().join("outside.txt");
        fs::write(&outside, "outside").expect("outside file should be created");
        symlink(&outside, source.join("linked.txt")).expect("symlink should be created");

        let error =
            collect_zip_entries(&source, &mut Vec::new()).expect_err("symlink should be rejected");

        assert!(matches!(error, AppError::Export(message) if message.contains("符号链接")));
    }
}
