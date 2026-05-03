//! 场景本地历史内核。
//!
//! 备份直写 `<project>/.webgalcraft/backups/`，不经过 VFS overlay。
//! scene 文件 (`PathCategory::GameContent`) 不被 overlay 代理，
//! 物理位置等同 `<project>/<logical_path>`，因此命令只需要 `(project_path, logical_path)`。
//!
//! 目录布局：
//! ```text
//! <project>/.webgalcraft/backups/
//!   ├── manifest.json            # 全部历史条目
//!   └── scene/
//!       └── <relative-without-ext>/
//!           └── <iso-timestamp>.bak
//! ```

use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Component, Path, PathBuf},
};

use chrono::{DateTime, SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::vfs::atomic_write;

use super::{AppError, AppResult};

const BACKUP_ROOT_REL: &str = ".webgalcraft/backups";
const MANIFEST_FILE: &str = "manifest.json";
const BACKUP_FILE_EXT: &str = "bak";
const SCENE_PATH_PREFIX: &str = "game/scene/";
const SCENE_FILE_EXT: &str = "txt";
const MANIFEST_SCHEMA_VERSION: u32 = 1;
/// 自动保存最小间隔：5 分钟
const MIN_AUTO_BACKUP_INTERVAL_MS: i64 = 5 * 60 * 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BackupSourceKind {
    ManualSave,
    AutoSave,
    Restore,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    /// 项目相对路径，例如 "game/scene/start.txt"。
    pub source_path: String,
    /// 备份内容相对 `<backups>/` 的路径，例如 "scene/start/2026-03-12T14-30-00Z.bak"。
    pub backup_path: String,
    /// ISO 8601 时间戳，例如 "2026-03-12T14:30:00Z"。
    pub timestamp: String,
    pub size_bytes: u64,
    /// 内容 SHA-256，前缀 `sha256:`。
    pub hash: String,
    pub source_kind: BackupSourceKind,
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct BackupManifest {
    version: u32,
    /// 全部条目，按 timestamp 倒序，最新的在前。
    entries: Vec<BackupEntry>,
}

impl Default for BackupManifest {
    fn default() -> Self {
        Self {
            version: MANIFEST_SCHEMA_VERSION,
            entries: Vec::new(),
        }
    }
}

fn backup_root(project_path: &Path) -> PathBuf {
    project_path.join(BACKUP_ROOT_REL)
}

fn manifest_file(project_path: &Path) -> PathBuf {
    backup_root(project_path).join(MANIFEST_FILE)
}

/// 把 `game/scene/foo/bar.txt` 转成镜像目录 `scene/foo/bar`（去掉 .txt 扩展名）。
fn mirror_dir_for(logical_path: &str) -> Option<PathBuf> {
    let relative = logical_path.strip_prefix("game/")?;
    let path = Path::new(relative);
    if path.extension().and_then(|s| s.to_str()) != Some(SCENE_FILE_EXT) {
        return None;
    }
    Some(path.with_extension(""))
}

fn read_manifest(project_path: &Path) -> AppResult<BackupManifest> {
    let path = manifest_file(project_path);
    if !path.is_file() {
        return Ok(BackupManifest::default());
    }
    let content = fs::read_to_string(&path)?;
    let manifest: BackupManifest =
        serde_json::from_str(&content).map_err(|err| AppError::BackupManifestCorrupted {
            reason: err.to_string(),
        })?;
    // 防止被篡改的 manifest 让 cleanup/trim 删除任意文件：所有路径必须是受控的安全相对路径
    for entry in &manifest.entries {
        validate_backup_path(&entry.backup_path).map_err(|_| {
            AppError::BackupManifestCorrupted {
                reason: format!("invalid backup_path: {}", entry.backup_path),
            }
        })?;
        if !is_supported_scene_path(&entry.source_path) {
            return Err(AppError::BackupManifestCorrupted {
                reason: format!("invalid source_path: {}", entry.source_path),
            });
        }
        if parse_iso(&entry.timestamp).is_none() {
            return Err(AppError::BackupManifestCorrupted {
                reason: format!("invalid timestamp: {}", entry.timestamp),
            });
        }
    }
    Ok(manifest)
}

async fn write_manifest(project_path: &Path, manifest: &BackupManifest) -> AppResult<()> {
    let target = manifest_file(project_path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    let serialized =
        serde_json::to_vec_pretty(manifest).map_err(|err| AppError::BackupManifestCorrupted {
            reason: err.to_string(),
        })?;
    atomic_write(&target, &serialized).await?;
    Ok(())
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn parse_iso(timestamp: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(timestamp)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

fn iso_to_filename(timestamp: &str) -> String {
    timestamp.replace(':', "-")
}

fn hash_bytes(content: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(content))
}

/// 构造备份相对路径，例如 `scene/start/2026-03-12T14-30-00Z.bak`，统一使用正斜杠。
fn make_backup_rel_path(mirror: &Path, timestamp: &str) -> String {
    mirror
        .join(format!("{}.{BACKUP_FILE_EXT}", iso_to_filename(timestamp)))
        .to_string_lossy()
        .replace('\\', "/")
}

/// 把内容原子写入 `<backups>/<backup_rel>`，自动创建父目录。
async fn write_backup_file(backups_root: &Path, backup_rel: &str, content: &[u8]) -> AppResult<()> {
    let target = backups_root.join(backup_rel);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    atomic_write(&target, content).await?;
    Ok(())
}

/// 把镜像目录转成 manifest 内 backup_path 共享的相对前缀，例如 `scene/start/`。
fn mirror_rel_prefix(mirror: &Path) -> String {
    format!("{}/", mirror.to_string_lossy().replace('\\', "/"))
}

/// 在 manifest 头部插入新条目并落盘。
async fn prepend_entry_and_save(
    project: &Path,
    manifest: &mut BackupManifest,
    entry: BackupEntry,
) -> AppResult<BackupEntry> {
    manifest.entries.insert(0, entry.clone());
    write_manifest(project, manifest).await?;
    Ok(entry)
}

/// 仅 game/scene/*.txt 才参与历史
fn is_supported_scene_path(logical_path: &str) -> bool {
    if !logical_path.starts_with(SCENE_PATH_PREFIX) {
        return false;
    }
    let path = Path::new(logical_path);
    if path.extension().and_then(|ext| ext.to_str()) != Some(SCENE_FILE_EXT) {
        return false;
    }
    is_safe_relative_path(path)
}

/// 拒绝绝对路径、`..`、`.` 段以及 Windows 盘符前缀，避免路径遍历。
fn is_safe_relative_path(path: &Path) -> bool {
    if path.is_absolute() {
        return false;
    }
    path.components()
        .all(|component| matches!(component, Component::Normal(_)))
}

/// 校验 `backup_path` 必须是 `scene/**/.bak` 形式的安全相对路径，防止读出/还原任意文件。
fn validate_backup_path(backup_path: &str) -> AppResult<&Path> {
    let path = Path::new(backup_path);
    let invalid = || {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("invalid backup path: {backup_path}"),
        )
    };
    if !is_safe_relative_path(path) {
        return Err(invalid().into());
    }
    let mut components = path.components();
    if !matches!(components.next(), Some(Component::Normal(seg)) if seg == "scene") {
        return Err(invalid().into());
    }
    if path.extension().and_then(|ext| ext.to_str()) != Some(BACKUP_FILE_EXT) {
        return Err(invalid().into());
    }
    Ok(path)
}

#[tauri::command]
pub async fn create_backup(
    project_path: String,
    logical_path: String,
    source_kind: BackupSourceKind,
    summary: Option<String>,
    force: bool,
    max_versions: Option<usize>,
) -> AppResult<Option<BackupEntry>> {
    if !is_supported_scene_path(&logical_path) {
        return Ok(None);
    }
    let Some(mirror) = mirror_dir_for(&logical_path) else {
        return Ok(None);
    };

    let project = PathBuf::from(&project_path);
    let content = fs::read(project.join(&logical_path))?;
    let hash = hash_bytes(&content);
    let timestamp = now_iso();

    let mut manifest = read_manifest(&project)?;
    if should_skip_dedup(&manifest, &logical_path, &hash, &timestamp, force) {
        return Ok(None);
    }

    let backups_root = backup_root(&project);
    let backup_path = make_backup_rel_path(&mirror, &timestamp);
    write_backup_file(&backups_root, &backup_path, &content).await?;

    let entry = BackupEntry {
        source_path: logical_path.clone(),
        backup_path,
        timestamp,
        size_bytes: content.len() as u64,
        hash,
        source_kind,
        summary,
    };
    manifest.entries.insert(0, entry.clone());

    // 顺手裁剪同 source 超额的旧条目，避免每次保存都触发全量 cleanup 扫描
    if let Some(max) = max_versions {
        trim_overflow_for_source(&mut manifest, &backups_root, &logical_path, max)?;
    }

    write_manifest(&project, &manifest).await?;
    Ok(Some(entry))
}

/// 移除 manifest 中同 source_path 超出 max_versions 的最旧条目，并删除其备份文件。
fn trim_overflow_for_source(
    manifest: &mut BackupManifest,
    backups_root: &Path,
    logical_path: &str,
    max_versions: usize,
) -> AppResult<()> {
    // 收集同 source 条目的 (位置, timestamp)，按时间倒序，保留前 max_versions 条
    let mut indexed: Vec<(usize, &str)> = manifest
        .entries
        .iter()
        .enumerate()
        .filter(|(_, entry)| entry.source_path == logical_path)
        .map(|(idx, entry)| (idx, entry.timestamp.as_str()))
        .collect();
    if indexed.len() <= max_versions {
        return Ok(());
    }
    indexed.sort_by(|a, b| b.1.cmp(a.1));
    let drop_indices: HashSet<usize> = indexed
        .into_iter()
        .skip(max_versions)
        .map(|(i, _)| i)
        .collect();

    let mut paths_to_remove: Vec<PathBuf> = Vec::with_capacity(drop_indices.len());
    let mut idx = 0;
    manifest.entries.retain(|entry| {
        let keep = !drop_indices.contains(&idx);
        if !keep {
            paths_to_remove.push(backups_root.join(&entry.backup_path));
        }
        idx += 1;
        keep
    });
    for path in paths_to_remove {
        if path.is_file() {
            fs::remove_file(&path)?;
        }
    }
    Ok(())
}

/// 去重判断：返回 true 表示应跳过本次备份。
///
/// - 仅与 manifest 中同 source_path 的最新一条比较 hash，相同则跳过
///   （注意：不做跨条目的全局去重，A→B→A 的第三次保存仍会建条目）；
///   Restore 不走该函数，由 `restore_backup` 直写 manifest 保证留痕
/// - 非 force 时，距上次同 source_path 备份不足 5 分钟则跳过
fn should_skip_dedup(
    manifest: &BackupManifest,
    logical_path: &str,
    hash: &str,
    timestamp_iso: &str,
    force: bool,
) -> bool {
    let Some(last) = manifest
        .entries
        .iter()
        .find(|entry| entry.source_path == logical_path)
    else {
        return false;
    };

    if last.hash == hash {
        return true;
    }
    if force {
        return false;
    }

    let (Some(prev), Some(now)) = (parse_iso(&last.timestamp), parse_iso(timestamp_iso)) else {
        return false;
    };
    now.signed_duration_since(prev).num_milliseconds() < MIN_AUTO_BACKUP_INTERVAL_MS
}

#[tauri::command]
pub fn list_backups(project_path: String, logical_path: String) -> AppResult<Vec<BackupEntry>> {
    let manifest = read_manifest(Path::new(&project_path))?;
    Ok(manifest
        .entries
        .into_iter()
        .filter(|entry| entry.source_path == logical_path)
        .collect())
}

#[tauri::command]
pub fn read_backup(project_path: String, backup_path: String) -> AppResult<String> {
    let safe_rel = validate_backup_path(&backup_path)?;
    let path = backup_root(Path::new(&project_path)).join(safe_rel);
    Ok(fs::read_to_string(&path)?)
}

#[tauri::command]
pub async fn restore_backup(
    project_path: String,
    logical_path: String,
    backup_path: String,
) -> AppResult<Option<BackupEntry>> {
    if !is_supported_scene_path(&logical_path) {
        return Ok(None);
    }
    let Some(mirror) = mirror_dir_for(&logical_path) else {
        return Ok(None);
    };

    let project = PathBuf::from(&project_path);
    let backups_root = backup_root(&project);
    let safe_rel = validate_backup_path(&backup_path)?;
    // 防止跨 scene 还原：backup_path 必须落在 logical_path 对应的镜像目录下
    if !safe_rel.starts_with(&mirror) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("backup path {backup_path} does not belong to {logical_path}"),
        )
        .into());
    }
    let content = fs::read(backups_root.join(safe_rel))?;

    // 先把内容写回源文件
    atomic_write(&project.join(&logical_path), &content).await?;

    // 再追加一条 Restore 条目，标记本次还原事件；force=true 跳过去重以确保留痕
    let timestamp = now_iso();
    let new_backup_path = make_backup_rel_path(&mirror, &timestamp);
    write_backup_file(&backups_root, &new_backup_path, &content).await?;

    let entry = BackupEntry {
        source_path: logical_path,
        backup_path: new_backup_path,
        timestamp,
        size_bytes: content.len() as u64,
        hash: hash_bytes(&content),
        source_kind: BackupSourceKind::Restore,
        summary: Some(format!("restore from {backup_path}")),
    };

    let mut manifest = read_manifest(&project)?;
    Ok(Some(
        prepend_entry_and_save(&project, &mut manifest, entry).await?,
    ))
}

#[tauri::command]
pub async fn cleanup_backups(
    project_path: String,
    max_versions: Option<usize>,
    max_days: Option<i64>,
) -> AppResult<usize> {
    let project = PathBuf::from(&project_path);
    let mut manifest = read_manifest(&project)?;
    let original_len = manifest.entries.len();
    if original_len == 0 {
        return Ok(0);
    }

    let cutoff = max_days.map(|days| Utc::now() - chrono::Duration::days(days));

    // 显式按 timestamp 倒序，确保下面的"每 source 保留前 N 条"逻辑不依赖外部插入顺序
    manifest
        .entries
        .sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    // 按 source_path 分桶：每桶最多保留 max_versions 条最新的；同时整体过滤过期条目
    let mut counts: HashMap<String, usize> = HashMap::new();
    manifest.entries.retain(|entry| {
        if let Some(threshold) = cutoff {
            if let Some(ts) = parse_iso(&entry.timestamp) {
                if ts < threshold {
                    return false;
                }
            }
        }
        if let Some(max) = max_versions {
            let count = counts.entry(entry.source_path.clone()).or_insert(0);
            if *count >= max {
                return false;
            }
            *count += 1;
        }
        true
    });

    let kept: HashSet<String> = manifest
        .entries
        .iter()
        .map(|entry| entry.backup_path.clone())
        .collect();
    let removed_len = original_len - manifest.entries.len();

    write_manifest(&project, &manifest).await?;
    remove_orphan_files(&backup_root(&project), &kept)?;
    Ok(removed_len)
}

/// 删除 manifest 中不再引用的备份文件。空目录一并清理。
fn remove_orphan_files(backups_root: &Path, kept: &HashSet<String>) -> AppResult<()> {
    let scene_root = backups_root.join("scene");
    if !scene_root.is_dir() {
        return Ok(());
    }
    walk_remove_orphans(&scene_root, backups_root, kept)?;
    Ok(())
}

fn walk_remove_orphans(
    dir: &Path,
    backups_root: &Path,
    kept: &HashSet<String>,
) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            walk_remove_orphans(&path, backups_root, kept)?;
            if fs::read_dir(&path)?.next().is_none() {
                fs::remove_dir(&path)?;
            }
            continue;
        }
        if path.extension().and_then(|s| s.to_str()) != Some(BACKUP_FILE_EXT) {
            continue;
        }
        let Ok(rel) = path.strip_prefix(backups_root) else {
            continue;
        };
        let rel_str = rel.to_string_lossy().replace('\\', "/");
        if !kept.contains(&rel_str) {
            fs::remove_file(&path)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn move_backup_history(
    project_path: String,
    old_logical_path: String,
    new_logical_path: String,
) -> AppResult<()> {
    if old_logical_path == new_logical_path {
        return Ok(());
    }
    if !is_supported_scene_path(&old_logical_path) || !is_supported_scene_path(&new_logical_path) {
        return Ok(());
    }

    let project = PathBuf::from(&project_path);
    let mut manifest = read_manifest(&project)?;

    let (Some(old_mirror), Some(new_mirror)) = (
        mirror_dir_for(&old_logical_path),
        mirror_dir_for(&new_logical_path),
    ) else {
        return Ok(());
    };
    let backups_root = backup_root(&project);
    let old_dir = backups_root.join(&old_mirror);
    let new_dir = backups_root.join(&new_mirror);

    // 目标已有独立历史：按 VS Code Local History 语义直接覆盖。
    // rename 操作的用户心智是"文件被改名了"，目标的旧历史与新文件不再有关联。
    if manifest
        .entries
        .iter()
        .any(|entry| entry.source_path == new_logical_path)
    {
        manifest
            .entries
            .retain(|entry| entry.source_path != new_logical_path);
        if new_dir.is_dir() {
            fs::remove_dir_all(&new_dir)?;
        }
    }

    if old_dir.is_dir() {
        if let Some(parent) = new_dir.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(&old_dir, &new_dir)?;
    }

    let old_rel_prefix = mirror_rel_prefix(&old_mirror);
    let new_rel_prefix = mirror_rel_prefix(&new_mirror);
    for entry in &mut manifest.entries {
        if entry.source_path == old_logical_path {
            entry.source_path = new_logical_path.clone();
            if let Some(rest) = entry.backup_path.strip_prefix(&old_rel_prefix) {
                entry.backup_path = format!("{new_rel_prefix}{rest}");
            }
        }
    }
    write_manifest(&project, &manifest).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use tokio::runtime::Builder;

    fn rt() -> tokio::runtime::Runtime {
        Builder::new_current_thread().enable_all().build().unwrap()
    }

    fn setup_scene(project: &Path, logical: &str, content: &str) {
        let abs = project.join(logical);
        fs::create_dir_all(abs.parent().unwrap()).unwrap();
        fs::write(abs, content).unwrap();
    }

    fn project_string(tmp: &TempDir) -> String {
        tmp.path().to_string_lossy().into_owned()
    }

    #[test]
    fn create_backup_writes_manifest_entry_with_source_kind() {
        let tmp = TempDir::new().unwrap();
        setup_scene(tmp.path(), "game/scene/start.txt", "hello");

        let entry = rt()
            .block_on(create_backup(
                project_string(&tmp),
                "game/scene/start.txt".into(),
                BackupSourceKind::ManualSave,
                None,
                true,
                None,
            ))
            .expect("create_backup should succeed")
            .expect("manual save should produce entry");

        assert_eq!(entry.source_path, "game/scene/start.txt");
        assert_eq!(entry.source_kind, BackupSourceKind::ManualSave);
        assert!(entry.backup_path.starts_with("scene/start/"));
        assert!(entry.backup_path.ends_with(".bak"));
        assert!(entry.hash.starts_with("sha256:"));

        let listed = list_backups(project_string(&tmp), "game/scene/start.txt".into()).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].backup_path, entry.backup_path);
    }

    #[test]
    fn manifest_uses_single_global_file_with_version() {
        let tmp = TempDir::new().unwrap();
        setup_scene(tmp.path(), "game/scene/start.txt", "hello");
        rt().block_on(create_backup(
            project_string(&tmp),
            "game/scene/start.txt".into(),
            BackupSourceKind::ManualSave,
            None,
            true,
            None,
        ))
        .unwrap();

        let manifest_text = fs::read_to_string(manifest_file(tmp.path())).unwrap();
        let manifest: serde_json::Value = serde_json::from_str(&manifest_text).unwrap();
        assert_eq!(manifest["version"], 1);
        assert_eq!(manifest["entries"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn rejects_non_scene_paths() {
        let tmp = TempDir::new().unwrap();
        setup_scene(tmp.path(), "game/figure/foo.png", "x");

        let entry = rt()
            .block_on(create_backup(
                project_string(&tmp),
                "game/figure/foo.png".into(),
                BackupSourceKind::ManualSave,
                None,
                true,
                None,
            ))
            .unwrap();
        assert!(entry.is_none());
    }

    #[test]
    fn auto_save_dedup_skips_when_hash_unchanged() {
        let tmp = TempDir::new().unwrap();
        setup_scene(tmp.path(), "game/scene/start.txt", "v1");

        let first = rt()
            .block_on(create_backup(
                project_string(&tmp),
                "game/scene/start.txt".into(),
                BackupSourceKind::AutoSave,
                None,
                false,
                None,
            ))
            .unwrap();
        assert!(first.is_some());

        let second = rt()
            .block_on(create_backup(
                project_string(&tmp),
                "game/scene/start.txt".into(),
                BackupSourceKind::AutoSave,
                None,
                false,
                None,
            ))
            .unwrap();
        assert!(second.is_none(), "same content should be deduped");
    }

    #[test]
    fn auto_save_skips_when_within_min_interval() {
        let tmp = TempDir::new().unwrap();
        setup_scene(tmp.path(), "game/scene/start.txt", "v1");

        rt().block_on(create_backup(
            project_string(&tmp),
            "game/scene/start.txt".into(),
            BackupSourceKind::AutoSave,
            None,
            false,
            None,
        ))
        .unwrap();

        // 改内容但仍在 5 分钟内
        fs::write(tmp.path().join("game/scene/start.txt"), "v2").unwrap();
        let throttled = rt()
            .block_on(create_backup(
                project_string(&tmp),
                "game/scene/start.txt".into(),
                BackupSourceKind::AutoSave,
                None,
                false,
                None,
            ))
            .unwrap();
        assert!(throttled.is_none(), "should be throttled by min interval");
    }

    #[test]
    fn force_bypasses_min_interval_but_still_dedups_hash() {
        let tmp = TempDir::new().unwrap();
        setup_scene(tmp.path(), "game/scene/start.txt", "v1");

        rt().block_on(create_backup(
            project_string(&tmp),
            "game/scene/start.txt".into(),
            BackupSourceKind::AutoSave,
            None,
            false,
            None,
        ))
        .unwrap();

        // force + 不同内容：应通过
        fs::write(tmp.path().join("game/scene/start.txt"), "v2").unwrap();
        let forced = rt()
            .block_on(create_backup(
                project_string(&tmp),
                "game/scene/start.txt".into(),
                BackupSourceKind::ManualSave,
                None,
                true,
                None,
            ))
            .unwrap();
        assert!(forced.is_some());

        // force + 完全相同内容：仍然 dedup（避免反复手动保存制造无意义历史）
        let dup = rt()
            .block_on(create_backup(
                project_string(&tmp),
                "game/scene/start.txt".into(),
                BackupSourceKind::ManualSave,
                None,
                true,
                None,
            ))
            .unwrap();
        assert!(dup.is_none());
    }

    #[test]
    fn move_backup_history_relocates_manifest_and_files() {
        let tmp = TempDir::new().unwrap();
        setup_scene(tmp.path(), "game/scene/a.txt", "a");
        rt().block_on(create_backup(
            project_string(&tmp),
            "game/scene/a.txt".into(),
            BackupSourceKind::ManualSave,
            None,
            true,
            None,
        ))
        .unwrap();

        rt().block_on(move_backup_history(
            project_string(&tmp),
            "game/scene/a.txt".into(),
            "game/scene/b.txt".into(),
        ))
        .unwrap();

        assert!(
            list_backups(project_string(&tmp), "game/scene/a.txt".into())
                .unwrap()
                .is_empty()
        );
        assert!(
            !list_backups(project_string(&tmp), "game/scene/b.txt".into())
                .unwrap()
                .is_empty()
        );

        let entries = list_backups(project_string(&tmp), "game/scene/b.txt".into()).unwrap();
        assert_eq!(entries[0].source_path, "game/scene/b.txt");
        assert!(entries[0].backup_path.starts_with("scene/b/"));
        assert!(tmp
            .path()
            .join(BACKUP_ROOT_REL)
            .join(&entries[0].backup_path)
            .is_file());
    }

    #[test]
    fn move_backup_history_overwrites_existing_target() {
        let tmp = TempDir::new().unwrap();
        setup_scene(tmp.path(), "game/scene/a.txt", "a");
        setup_scene(tmp.path(), "game/scene/b.txt", "b");

        let a_entry = rt()
            .block_on(create_backup(
                project_string(&tmp),
                "game/scene/a.txt".into(),
                BackupSourceKind::ManualSave,
                None,
                true,
                None,
            ))
            .unwrap()
            .unwrap();
        let b_entry = rt()
            .block_on(create_backup(
                project_string(&tmp),
                "game/scene/b.txt".into(),
                BackupSourceKind::ManualSave,
                None,
                true,
                None,
            ))
            .unwrap()
            .unwrap();

        rt().block_on(move_backup_history(
            project_string(&tmp),
            "game/scene/a.txt".into(),
            "game/scene/b.txt".into(),
        ))
        .expect("rename should overwrite target history");

        // a 的历史已迁移到 b；b 的旧历史被丢弃
        let entries = list_backups(project_string(&tmp), "game/scene/b.txt".into()).unwrap();
        assert_eq!(
            entries.len(),
            1,
            "only the renamed-from-a entry should remain"
        );
        assert!(entries[0].backup_path.starts_with("scene/b/"));
        assert_eq!(
            entries[0].hash, a_entry.hash,
            "remaining entry should originate from a"
        );

        // b 的旧 backup 文件已被物理清理
        let stale = tmp.path().join(BACKUP_ROOT_REL).join(&b_entry.backup_path);
        assert!(!stale.exists(), "old target backup file should be removed");

        // a 的历史路径不再存在
        assert!(
            list_backups(project_string(&tmp), "game/scene/a.txt".into())
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn restore_backup_writes_restore_entry_then_overwrites_source() {
        let tmp = TempDir::new().unwrap();
        let logical = "game/scene/start.txt";
        setup_scene(tmp.path(), logical, "v1");

        let v1 = rt()
            .block_on(create_backup(
                project_string(&tmp),
                logical.into(),
                BackupSourceKind::ManualSave,
                None,
                true,
                None,
            ))
            .unwrap()
            .unwrap();

        fs::write(tmp.path().join(logical), "v2").unwrap();
        rt().block_on(restore_backup(
            project_string(&tmp),
            logical.into(),
            v1.backup_path.clone(),
        ))
        .unwrap();

        let restored = fs::read_to_string(tmp.path().join(logical)).unwrap();
        assert_eq!(restored, "v1");

        let entries = list_backups(project_string(&tmp), logical.into()).unwrap();
        assert!(entries
            .iter()
            .any(|entry| entry.source_kind == BackupSourceKind::Restore));
    }

    #[test]
    fn cleanup_backups_drops_oldest_per_source_and_orphan_files() {
        let tmp = TempDir::new().unwrap();
        let logical = "game/scene/start.txt";
        setup_scene(tmp.path(), logical, "seed");

        let mut manifest = BackupManifest::default();
        let mut all_paths = Vec::new();
        for i in 0..3 {
            let timestamp = format!("2026-03-1{}T10:00:00Z", i);
            let backup_path = format!("scene/start/{}.bak", iso_to_filename(&timestamp));
            let abs = tmp.path().join(BACKUP_ROOT_REL).join(&backup_path);
            fs::create_dir_all(abs.parent().unwrap()).unwrap();
            fs::write(&abs, format!("v{i}")).unwrap();
            manifest.entries.insert(
                0,
                BackupEntry {
                    source_path: logical.into(),
                    backup_path: backup_path.clone(),
                    timestamp,
                    size_bytes: 2,
                    hash: format!("sha256:dummy{i}"),
                    source_kind: BackupSourceKind::AutoSave,
                    summary: None,
                },
            );
            all_paths.push(backup_path);
        }
        rt().block_on(write_manifest(tmp.path(), &manifest))
            .unwrap();

        let removed = rt()
            .block_on(cleanup_backups(project_string(&tmp), Some(2), None))
            .unwrap();
        assert_eq!(removed, 1);

        let entries = list_backups(project_string(&tmp), logical.into()).unwrap();
        assert_eq!(entries.len(), 2);

        // 被淘汰的孤儿文件应被物理删除
        let orphan = &all_paths[0]; // 最早的那条
        assert!(!tmp.path().join(BACKUP_ROOT_REL).join(orphan).exists());
    }

    #[test]
    fn read_backup_returns_stored_content() {
        let tmp = TempDir::new().unwrap();
        let logical = "game/scene/start.txt";
        setup_scene(tmp.path(), logical, "hello world");

        let entry = rt()
            .block_on(create_backup(
                project_string(&tmp),
                logical.into(),
                BackupSourceKind::ManualSave,
                None,
                true,
                None,
            ))
            .unwrap()
            .unwrap();

        let content = read_backup(project_string(&tmp), entry.backup_path).unwrap();
        assert_eq!(content, "hello world");
    }

    #[test]
    fn corrupted_manifest_is_reported_as_error_not_silently_reset() {
        let tmp = TempDir::new().unwrap();
        let manifest_path = manifest_file(tmp.path());
        fs::create_dir_all(manifest_path.parent().unwrap()).unwrap();
        fs::write(&manifest_path, "{ not valid json").unwrap();

        let err = read_manifest(tmp.path()).expect_err("corrupted manifest must surface as error");
        assert!(matches!(err, AppError::BackupManifestCorrupted { .. }));
    }

    #[test]
    fn manifest_with_unsafe_paths_is_rejected() {
        let tmp = TempDir::new().unwrap();
        let cases = [
            // backup_path 越界
            r#"{"version":1,"entries":[{"sourcePath":"game/scene/a.txt","backupPath":"../escape.bak","timestamp":"2026-03-12T10:00:00Z","sizeBytes":1,"hash":"sha256:x","sourceKind":"manual-save","summary":null}]}"#,
            // source_path 越界
            r#"{"version":1,"entries":[{"sourcePath":"../etc/passwd","backupPath":"scene/a/2026-03-12T10-00-00Z.bak","timestamp":"2026-03-12T10:00:00Z","sizeBytes":1,"hash":"sha256:x","sourceKind":"manual-save","summary":null}]}"#,
            // timestamp 非法
            r#"{"version":1,"entries":[{"sourcePath":"game/scene/a.txt","backupPath":"scene/a/x.bak","timestamp":"not-a-time","sizeBytes":1,"hash":"sha256:x","sourceKind":"manual-save","summary":null}]}"#,
        ];
        for raw in cases {
            let manifest_path = manifest_file(tmp.path());
            fs::create_dir_all(manifest_path.parent().unwrap()).unwrap();
            fs::write(&manifest_path, raw).unwrap();
            let err = read_manifest(tmp.path()).expect_err("unsafe manifest must be rejected");
            assert!(matches!(err, AppError::BackupManifestCorrupted { .. }));
        }
    }

    #[test]
    fn cleanup_keeps_newest_per_source_regardless_of_manifest_order() {
        let tmp = TempDir::new().unwrap();
        let logical = "game/scene/start.txt";

        // 故意把"较老"的条目放在前面，模拟意外乱序的 manifest
        let entries = [
            ("2026-03-10T10:00:00Z", "old"),
            ("2026-03-12T10:00:00Z", "newest"),
            ("2026-03-11T10:00:00Z", "middle"),
        ];
        let mut manifest = BackupManifest::default();
        for (ts, tag) in entries {
            let backup_path = format!("scene/start/{}.bak", iso_to_filename(ts));
            let abs = tmp.path().join(BACKUP_ROOT_REL).join(&backup_path);
            fs::create_dir_all(abs.parent().unwrap()).unwrap();
            fs::write(&abs, tag).unwrap();
            manifest.entries.push(BackupEntry {
                source_path: logical.into(),
                backup_path,
                timestamp: ts.into(),
                size_bytes: tag.len() as u64,
                hash: format!("sha256:{tag}"),
                source_kind: BackupSourceKind::AutoSave,
                summary: None,
            });
        }
        rt().block_on(write_manifest(tmp.path(), &manifest))
            .unwrap();

        rt().block_on(cleanup_backups(project_string(&tmp), Some(1), None))
            .unwrap();

        let kept = list_backups(project_string(&tmp), logical.into()).unwrap();
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].timestamp, "2026-03-12T10:00:00Z");
    }

    #[test]
    fn create_backup_inline_trims_overflow_for_same_source() {
        let tmp = TempDir::new().unwrap();
        let logical = "game/scene/start.txt";

        for tag in ["v1", "v2", "v3"] {
            fs::write(
                tmp.path().join("game/scene").join("start.txt").as_path(),
                tag,
            )
            .ok();
            // 创建目录的副作用由 setup_scene 完成；此处确保父目录存在
            setup_scene(tmp.path(), logical, tag);
            rt().block_on(create_backup(
                project_string(&tmp),
                logical.into(),
                BackupSourceKind::ManualSave,
                None,
                true,
                Some(2),
            ))
            .unwrap();
        }

        // 仅保留最近 2 条
        let kept = list_backups(project_string(&tmp), logical.into()).unwrap();
        assert_eq!(kept.len(), 2);
        assert!(kept
            .iter()
            .any(|e| e.hash.ends_with(&format!("{:x}", Sha256::digest(b"v3")))));
        assert!(kept
            .iter()
            .any(|e| e.hash.ends_with(&format!("{:x}", Sha256::digest(b"v2")))));

        // 被淘汰的 v1 物理文件应不存在
        let v1_hash = format!("sha256:{:x}", Sha256::digest(b"v1"));
        assert!(!kept.iter().any(|e| e.hash == v1_hash));
    }

    #[test]
    fn rejects_path_traversal_in_logical_path() {
        assert!(!is_supported_scene_path("game/scene/../../etc/passwd"));
        assert!(!is_supported_scene_path("/abs/game/scene/start.txt"));
    }

    #[test]
    fn read_backup_rejects_traversal_paths() {
        let tmp = TempDir::new().unwrap();
        let cases = [
            "../../etc/passwd",
            "scene/../../escape.bak",
            "scene/start/foo.txt",
            "/abs/scene/foo.bak",
        ];
        for bad in cases {
            let err = read_backup(project_string(&tmp), bad.into());
            assert!(err.is_err(), "should reject {bad}");
        }
    }

    #[test]
    fn restore_backup_rejects_traversal_paths() {
        let tmp = TempDir::new().unwrap();
        let logical = "game/scene/start.txt";
        setup_scene(tmp.path(), logical, "v1");
        let err = rt().block_on(restore_backup(
            project_string(&tmp),
            logical.into(),
            "../../escape.bak".into(),
        ));
        assert!(err.is_err(), "should reject traversal in restore");
    }

    #[test]
    fn restore_backup_rejects_cross_scene_backup_path() {
        let tmp = TempDir::new().unwrap();
        setup_scene(tmp.path(), "game/scene/a.txt", "a");
        setup_scene(tmp.path(), "game/scene/b.txt", "b");

        let a_entry = rt()
            .block_on(create_backup(
                project_string(&tmp),
                "game/scene/a.txt".into(),
                BackupSourceKind::ManualSave,
                None,
                true,
                None,
            ))
            .unwrap()
            .unwrap();

        // 用 a 的 backup_path 去 restore b：必须被拒绝，避免把 a 的内容写进 b
        let err = rt().block_on(restore_backup(
            project_string(&tmp),
            "game/scene/b.txt".into(),
            a_entry.backup_path,
        ));
        assert!(err.is_err(), "cross-scene restore must be rejected");
        assert_eq!(
            fs::read_to_string(tmp.path().join("game/scene/b.txt")).unwrap(),
            "b",
            "b's source must be untouched"
        );
    }
}
