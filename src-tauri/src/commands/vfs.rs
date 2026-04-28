use std::path::{Path, PathBuf};

use crate::vfs::{
    self, resolve_default_template_path, sanitize_logical_path, OverlayFs, VfsDirEntry, VfsError,
};

use super::AppResult;

fn build_overlay(
    project_path: &str,
    engine_path: &str,
    template_path: Option<String>,
) -> Result<OverlayFs, VfsError> {
    let template = template_path
        .map(PathBuf::from)
        .filter(|p| p.is_dir())
        .or_else(|| resolve_default_template_path(Some(Path::new(engine_path))))
        .filter(|p| p.is_dir());
    OverlayFs::new(
        PathBuf::from(project_path),
        Some(PathBuf::from(engine_path)),
        template,
    )
}

fn sanitize_rename_target(parent: &Path, new_name: &str) -> Result<PathBuf, VfsError> {
    let sanitized = sanitize_logical_path(new_name)?;
    if sanitized.as_os_str().is_empty() || sanitized.components().count() != 1 {
        return Err(VfsError::PathDenied);
    }

    Ok(parent.join(sanitized))
}

fn sanitize_move_target(target_rel_path: &str) -> Result<PathBuf, VfsError> {
    let sanitized = sanitize_logical_path(target_rel_path)?;
    if sanitized.as_os_str().is_empty() {
        return Err(VfsError::PathDenied);
    }

    Ok(sanitized)
}

/// VFS 命令对外暴露两种路径：物理绝对路径（保留平台分隔符，供前端 `convertFileSrc` 等消费）
/// 与逻辑相对路径（始终 `/`，作为下次 VFS 调用的 `relPath`）。
fn to_physical_path_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn to_logical_path_string(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

#[tauri::command]
pub fn resolve_vfs_path(
    project_path: String,
    engine_path: String,
    template_path: Option<String>,
    rel_path: String,
) -> AppResult<String> {
    let logical_path = sanitize_logical_path(&rel_path)?;
    let overlay = build_overlay(&project_path, &engine_path, template_path)?;
    let resolved = overlay.resolve_physical_path(&logical_path)?;
    Ok(to_physical_path_string(&resolved.physical_path))
}

#[tauri::command]
pub fn list_vfs_dir(
    project_path: String,
    engine_path: String,
    template_path: Option<String>,
    rel_path: String,
) -> AppResult<Vec<VfsDirEntry>> {
    let logical_dir = sanitize_logical_path(&rel_path)?;
    let overlay = build_overlay(&project_path, &engine_path, template_path)?;
    overlay.list_entries(&logical_dir).map_err(Into::into)
}

#[tauri::command]
pub fn ensure_vfs_writable(
    project_path: String,
    engine_path: String,
    template_path: Option<String>,
    rel_path: String,
) -> AppResult<String> {
    let logical_path = sanitize_logical_path(&rel_path)?;
    let overlay = build_overlay(&project_path, &engine_path, template_path)?;
    let path = overlay.ensure_writable(&logical_path)?;
    Ok(to_physical_path_string(&path))
}

#[tauri::command]
pub fn delete_vfs_path(
    project_path: String,
    engine_path: String,
    template_path: Option<String>,
    rel_path: String,
) -> AppResult<()> {
    let logical_path = sanitize_logical_path(&rel_path)?;
    let overlay = build_overlay(&project_path, &engine_path, template_path)?;
    overlay.remove_logical_path(&logical_path)?;
    log::debug!("VFS 删除: {}", logical_path.display());
    Ok(())
}

#[tauri::command]
pub fn rename_vfs_path(
    project_path: String,
    engine_path: String,
    template_path: Option<String>,
    rel_path: String,
    new_name: String,
) -> AppResult<String> {
    let logical_path = sanitize_logical_path(&rel_path)?;
    let parent = logical_path.parent().unwrap_or_else(|| Path::new(""));
    let target_path = sanitize_rename_target(parent, &new_name)?;
    let overlay = build_overlay(&project_path, &engine_path, template_path)?;
    overlay.rename_logical_path(&logical_path, &target_path)?;
    log::debug!(
        "VFS 重命名: {} -> {}",
        logical_path.display(),
        target_path.display()
    );
    Ok(to_logical_path_string(&target_path))
}

#[tauri::command]
pub fn move_vfs_path(
    project_path: String,
    engine_path: String,
    template_path: Option<String>,
    rel_path: String,
    target_rel_path: String,
) -> AppResult<String> {
    let logical_path = sanitize_logical_path(&rel_path)?;
    let target_path = sanitize_move_target(&target_rel_path)?;
    let overlay = build_overlay(&project_path, &engine_path, template_path)?;
    overlay.rename_logical_path(&logical_path, &target_path)?;
    log::debug!(
        "VFS 移动: {} -> {}",
        logical_path.display(),
        target_path.display()
    );
    Ok(to_logical_path_string(&target_path))
}

#[tauri::command]
pub fn copy_vfs_path(
    project_path: String,
    engine_path: String,
    template_path: Option<String>,
    rel_path: String,
    target_rel_path: String,
) -> AppResult<String> {
    let logical_path = sanitize_logical_path(&rel_path)?;
    let target_path = sanitize_logical_path(&target_rel_path)?;
    let overlay = build_overlay(&project_path, &engine_path, template_path)?;
    overlay.copy_logical_path(&logical_path, &target_path)?;
    log::debug!(
        "VFS 复制: {} -> {}",
        logical_path.display(),
        target_path.display()
    );
    Ok(to_logical_path_string(&target_path))
}

#[tauri::command]
pub fn is_template_dirty(project_path: String) -> AppResult<bool> {
    vfs::is_template_dirty(Path::new(&project_path)).map_err(Into::into)
}

#[tauri::command]
pub fn clean_template_upper(project_path: String) -> AppResult<()> {
    log::debug!("VFS 清理模板 upper: {project_path}");
    vfs::clean_template_upper(Path::new(&project_path)).map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use tempfile::tempdir;

    use super::{build_overlay, sanitize_rename_target};
    use crate::vfs::VfsError;

    #[test]
    fn sanitize_rename_target_rejects_nested_or_traversal_names() {
        assert!(matches!(
            sanitize_rename_target(Path::new("game/scene"), "../secret.txt"),
            Err(VfsError::PathDenied)
        ));
        assert!(matches!(
            sanitize_rename_target(Path::new("game/scene"), "nested/file.txt"),
            Err(VfsError::PathDenied)
        ));
    }

    #[test]
    fn sanitize_rename_target_accepts_single_safe_segment() {
        assert_eq!(
            sanitize_rename_target(Path::new("game/scene"), "next.txt")
                .expect("safe rename target should pass"),
            PathBuf::from("game/scene").join("next.txt")
        );
    }

    #[test]
    fn build_overlay_allows_engines_without_template_directory() {
        let upper = tempdir().expect("upper temp dir should be created");
        let engine = tempdir().expect("engine temp dir should be created");
        let upper_str = upper
            .path()
            .to_str()
            .expect("temp path should be valid UTF-8");
        let engine_str = engine
            .path()
            .to_str()
            .expect("temp path should be valid UTF-8");

        assert!(
            build_overlay(upper_str, engine_str, None).is_ok(),
            "missing game/template should not break non-template VFS commands"
        );
    }
}
