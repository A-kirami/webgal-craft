use std::{
    collections::BTreeMap,
    fs,
    io::ErrorKind,
    io::Write,
    path::{Component, Path, PathBuf},
};

use percent_encoding::percent_decode_str;
use serde::{Deserialize, Serialize};
use tempfile::NamedTempFile;
use thiserror::Error;

use crate::commands::{AppError, AppResult};

const PROJECT_CONFIG_FILE: &str = "project.wgcp";
const CURRENT_SCHEMA_VERSION: u32 = 1;
const VFS_METADATA_DIR: &str = ".wgc-vfs";
const WHITEOUTS_DIR: &str = "whiteouts";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProjectConfig {
    pub version: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub engine: Option<EngineRef>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template: Option<TemplateBinding>,
}

#[derive(Debug, Deserialize)]
struct ProjectConfigVersionProbe {
    version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct EngineRef {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TemplateBinding {
    Standalone {
        name: String,
    },
    EngineBuiltin {
        engine: EngineRef,
    },
}

#[derive(Debug, Clone)]
#[allow(dead_code)] // PR3 server 重构启用
pub struct ResolvedFile {
    pub physical_path: PathBuf,
    pub content_type: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedPhysicalPath {
    pub physical_path: PathBuf,
    pub(crate) canonical_root: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PathCategory {
    EngineRuntime,
    EngineOverride,
    TemplateContent,
    GameContent,
    Unclassified,
}

impl PathCategory {
    /// upper 层是否应优先于 lower 层（用于 overlay 解析）
    fn prefers_upper_layer(self) -> bool {
        matches!(
            self,
            Self::EngineOverride | Self::TemplateContent | Self::GameContent
        )
    }

    fn uses_whiteout(self) -> bool {
        matches!(self, Self::TemplateContent | Self::GameContent)
    }

    fn ensure_mutable(self) -> Result<(), VfsError> {
        if matches!(
            self,
            Self::EngineOverride | Self::TemplateContent | Self::GameContent
        ) {
            Ok(())
        } else {
            Err(VfsError::WriteToEngineRuntime)
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum VfsSource {
    Upper,
    EngineLower,
    TemplateLower,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct VfsDirEntry {
    pub name: String,
    pub is_dir: bool,
    pub source: VfsSource,
}

#[derive(Debug, Error)]
pub enum VfsError {
    #[error("路径被拒绝：不安全的路径")]
    PathDenied,

    #[error("文件未找到")]
    NotFound,

    #[error("写入被拒绝：引擎运行时文件不可覆盖")]
    WriteToEngineRuntime,

    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),
}

impl VfsError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::PathDenied => "PATH_DENIED",
            Self::NotFound => "NOT_FOUND",
            Self::WriteToEngineRuntime => "WRITE_TO_ENGINE_RUNTIME",
            Self::Io(_) => "VFS_ERROR",
        }
    }
}

pub struct OverlayFs {
    upper: PathBuf,
    upper_canonical: PathBuf,
    engine_lower: Option<PathBuf>,
    engine_lower_canonical: Option<PathBuf>,
    template_lower: Option<PathBuf>,
    template_lower_canonical: Option<PathBuf>,
    whiteout_root: PathBuf,
}

impl OverlayFs {
    pub fn new(
        upper: PathBuf,
        engine_lower: Option<PathBuf>,
        template_lower: Option<PathBuf>,
    ) -> Result<Self, VfsError> {
        let upper_canonical = upper.canonicalize()?;
        let engine_lower_canonical = engine_lower
            .as_ref()
            .map(|path| path.canonicalize())
            .transpose()?;
        let template_lower_canonical = template_lower
            .as_ref()
            .map(|path| path.canonicalize())
            .transpose()?;
        let whiteout_root = upper.join(VFS_METADATA_DIR).join(WHITEOUTS_DIR);

        Ok(Self {
            upper,
            upper_canonical,
            engine_lower,
            engine_lower_canonical,
            template_lower,
            template_lower_canonical,
            whiteout_root,
        })
    }

    #[allow(dead_code)] // PR3 server 重构启用
    pub fn resolve_file(&self, logical_path: &Path) -> Result<ResolvedFile, VfsError> {
        let resolved = self.resolve_physical_path(logical_path)?;
        let metadata = fs::metadata(&resolved.physical_path)?;

        if !metadata.is_file() {
            return Err(VfsError::NotFound);
        }

        Ok(ResolvedFile {
            content_type: mime_guess::from_path(&resolved.physical_path)
                .first_or_octet_stream()
                .to_string(),
            physical_path: resolved.physical_path,
        })
    }

    pub fn resolve_physical_path(
        &self,
        logical_path: &Path,
    ) -> Result<ResolvedPhysicalPath, VfsError> {
        let category = classify_path(logical_path);

        // upper 优先时，先检查 upper 层
        if category.prefers_upper_layer() || self.engine_lower.is_none() {
            let upper_path = self.upper.join(logical_path);
            if upper_path.exists() {
                validate_read_path_fast(&upper_path, &self.upper_canonical)?;
                return Ok(ResolvedPhysicalPath {
                    physical_path: upper_path,
                    canonical_root: self.upper_canonical.clone(),
                });
            }

            if category.uses_whiteout() && self.is_whiteouted(logical_path)? {
                return Err(VfsError::NotFound);
            }
        }

        // 尝试 lower 层
        if let Some((lower_path, lower_canonical)) = self.resolve_lower_path(logical_path) {
            if lower_path.exists() {
                validate_read_path_fast(&lower_path, lower_canonical)?;
                return Ok(ResolvedPhysicalPath {
                    physical_path: lower_path,
                    canonical_root: lower_canonical.to_path_buf(),
                });
            }
        }

        // 无 lower 层时回退到 upper（引擎运行时文件可能只存在于 upper）
        let upper_path = self.upper.join(logical_path);
        if upper_path.exists() {
            validate_read_path_fast(&upper_path, &self.upper_canonical)?;
            return Ok(ResolvedPhysicalPath {
                physical_path: upper_path,
                canonical_root: self.upper_canonical.clone(),
            });
        }

        Err(VfsError::NotFound)
    }

    pub fn ensure_writable(&self, logical_path: &Path) -> Result<PathBuf, VfsError> {
        let category = classify_path(logical_path);
        category.ensure_mutable()?;
        let upper_path = self.validate_upper_path(logical_path)?;
        self.clear_whiteout(logical_path)?;

        if category == PathCategory::EngineOverride {
            ensure_parent_dir(&upper_path)?;
            return Ok(upper_path);
        }

        // TemplateContent | GameContent
        if upper_path.exists() {
            return Ok(upper_path);
        }

        if let Some((lower_path, lower_canonical)) = self.resolve_lower_path(logical_path) {
            if lower_path.exists() {
                validate_physical_path(&lower_path, lower_canonical)?;
                copy_path(&lower_path, &upper_path)?;
                return Ok(upper_path);
            }
        }

        ensure_parent_dir(&upper_path)?;
        Ok(upper_path)
    }

    pub fn logical_path_is_directory(&self, logical_path: &Path) -> Result<bool, VfsError> {
        let resolved = self.resolve_physical_path(logical_path)?;
        Ok(fs::metadata(resolved.physical_path)?.is_dir())
    }

    pub fn remove_logical_path(&self, logical_path: &Path) -> Result<(), VfsError> {
        let category = classify_path(logical_path);
        category.ensure_mutable()?;

        let upper_path = self.validate_upper_path(logical_path)?;
        let lower_exists = self
            .resolve_lower_path(logical_path)
            .is_some_and(|(lower_path, _)| lower_path.exists());

        if category == PathCategory::EngineOverride {
            if upper_path.exists() {
                remove_path(&upper_path)?;
                self.clear_whiteout(logical_path)?;
                return Ok(());
            }

            return if lower_exists {
                Err(VfsError::WriteToEngineRuntime)
            } else {
                Err(VfsError::NotFound)
            };
        }

        // TemplateContent | GameContent
        if upper_path.exists() {
            remove_path(&upper_path)?;
        }

        if lower_exists {
            self.create_whiteout(logical_path)?;
        } else {
            self.clear_whiteout(logical_path)?;
        }

        Ok(())
    }

    pub fn rename_logical_path(&self, from: &Path, to: &Path) -> Result<(), VfsError> {
        let source_category = classify_path(from);
        let target_category = classify_path(to);
        source_category.ensure_mutable()?;
        target_category.ensure_mutable()?;

        if from == to {
            return Ok(());
        }

        if self.logical_path_exists(to)? {
            return Err(already_exists_error());
        }

        let source_upper = self.validate_upper_path(from)?;
        let source_lower = self
            .resolve_lower_path(from)
            .filter(|(lower_path, _)| lower_path.exists());
        let target_upper = self.validate_upper_path(to)?;

        if !source_upper.exists() && source_lower.is_none() && !self.is_whiteouted(from)? {
            return Err(VfsError::NotFound);
        }

        self.ensure_directory_target_is_not_nested(from, to)?;
        ensure_parent_dir(&target_upper)?;

        if source_category == PathCategory::EngineOverride {
            if !source_upper.exists() {
                return if source_lower.is_some() {
                    Err(VfsError::WriteToEngineRuntime)
                } else {
                    Err(VfsError::NotFound)
                };
            }

            fs::rename(&source_upper, &target_upper)?;
            self.clear_whiteout(from)?;
        } else {
            // TemplateContent | GameContent
            if source_upper.exists() {
                if source_lower.is_some() && source_upper.is_dir() {
                    self.copy_overlay_path(from, to)?;
                    remove_path(&source_upper)?;
                } else {
                    fs::rename(&source_upper, &target_upper)?;
                }
            } else if source_lower.is_some() {
                self.copy_overlay_path(from, to)?;
            } else {
                return Err(VfsError::NotFound);
            }

            if source_lower.is_some() {
                self.create_whiteout(from)?;
            }
        }

        self.clear_whiteout(to)?;
        Ok(())
    }

    pub fn copy_logical_path(&self, from: &Path, to: &Path) -> Result<(), VfsError> {
        classify_path(from).ensure_mutable()?;
        classify_path(to).ensure_mutable()?;

        if self.logical_path_exists(to)? {
            return Err(already_exists_error());
        }

        self.ensure_directory_target_is_not_nested(from, to)?;
        self.copy_overlay_path(from, to)
    }

    pub fn list_entries(&self, logical_dir: &Path) -> Result<Vec<VfsDirEntry>, VfsError> {
        let mut entries = BTreeMap::<String, VfsDirEntry>::new();

        if classify_path(logical_dir) == PathCategory::TemplateContent {
            if let Some(template_dir) = self.template_dir_for_list(logical_dir) {
                self.extend_from_lower(
                    logical_dir,
                    &template_dir,
                    VfsSource::TemplateLower,
                    &mut entries,
                )?;
            }
        } else if let Some(engine_dir) = self.engine_dir_for_list(logical_dir) {
            self.extend_from_lower(logical_dir, &engine_dir, VfsSource::EngineLower, &mut entries)?;
        }

        self.extend_template_root_entry(logical_dir, &mut entries)?;

        let upper_dir = self.upper.join(logical_dir);
        if upper_dir.is_dir() {
            for entry in fs::read_dir(&upper_dir)? {
                let entry = entry?;
                let name = entry.file_name().to_string_lossy().to_string();
                let child_logical = join_logical(logical_dir, &name);
                let child_category = classify_path(&child_logical);

                if is_internal_metadata_path(&child_logical)
                    || !child_category.prefers_upper_layer()
                {
                    continue;
                }

                let is_dir = entry.file_type()?.is_dir();
                entries.insert(
                    name.clone(),
                    VfsDirEntry {
                        is_dir,
                        name,
                        source: VfsSource::Upper,
                    },
                );
            }
        }

        let mut result = entries.into_values().collect::<Vec<_>>();
        result.sort_by(|left, right| {
            right
                .is_dir
                .cmp(&left.is_dir)
                .then_with(|| left.name.cmp(&right.name))
        });

        Ok(result)
    }

    fn extend_template_root_entry(
        &self,
        logical_dir: &Path,
        entries: &mut BTreeMap<String, VfsDirEntry>,
    ) -> Result<(), VfsError> {
        if logical_dir != Path::new("game") {
            return Ok(());
        }

        let Some(template_lower) = self.template_lower.as_ref() else {
            return Ok(());
        };

        if !template_lower.is_dir() {
            return Ok(());
        }

        let template_logical = Path::new("game").join("template");
        if self.is_whiteouted(&template_logical)? {
            return Ok(());
        }

        entries
            .entry(String::from("template"))
            .or_insert(VfsDirEntry {
                is_dir: true,
                name: String::from("template"),
                source: VfsSource::TemplateLower,
            });

        Ok(())
    }

    fn extend_from_lower(
        &self,
        logical_dir: &Path,
        lower_dir: &Path,
        source: VfsSource,
        entries: &mut BTreeMap<String, VfsDirEntry>,
    ) -> Result<(), VfsError> {
        if !lower_dir.is_dir() {
            return Ok(());
        }

        for entry in fs::read_dir(lower_dir)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().to_string();
            let child_logical = join_logical(logical_dir, &name);
            let child_category = classify_path(&child_logical);

            if is_internal_metadata_path(&child_logical)
                || (child_category.uses_whiteout() && self.is_whiteouted(&child_logical)?)
            {
                continue;
            }

            let is_dir = entry.file_type()?.is_dir();
            let entry_source = if source == VfsSource::EngineLower
                && logical_dir == Path::new("game")
                && name == "template"
                && self.template_lower.is_some()
            {
                VfsSource::TemplateLower
            } else {
                source
            };

            entries.entry(name.clone()).or_insert(VfsDirEntry {
                is_dir,
                name,
                source: entry_source,
            });
        }

        Ok(())
    }

    fn resolve_lower_path(&self, logical_path: &Path) -> Option<(PathBuf, &Path)> {
        match classify_path(logical_path) {
            PathCategory::TemplateContent => {
                let template_lower = self.template_lower.as_ref()?;
                let template_canonical = self.template_lower_canonical.as_ref()?;
                let relative = strip_template_prefix(logical_path)?;
                Some((template_lower.join(relative), template_canonical))
            }
            PathCategory::EngineRuntime
            | PathCategory::EngineOverride
            | PathCategory::Unclassified => {
                let engine_lower = self.engine_lower.as_ref()?;
                let engine_canonical = self.engine_lower_canonical.as_ref()?;
                Some((engine_lower.join(logical_path), engine_canonical))
            }
            PathCategory::GameContent => None,
        }
    }

    fn engine_dir_for_list(&self, logical_dir: &Path) -> Option<PathBuf> {
        if classify_path(logical_dir) == PathCategory::GameContent {
            return None;
        }

        let engine_lower = self.engine_lower.as_ref()?;
        Some(engine_lower.join(logical_dir))
    }

    fn template_dir_for_list(&self, logical_dir: &Path) -> Option<PathBuf> {
        let template_lower = self.template_lower.as_ref()?;
        let relative = strip_template_prefix(logical_dir)?;
        Some(template_lower.join(relative))
    }

    fn create_whiteout(&self, logical_path: &Path) -> Result<(), VfsError> {
        let marker_path = self.whiteout_marker_path(logical_path);
        self.validate_project_owned_path(&marker_path)?;
        ensure_parent_dir(&marker_path)?;
        fs::write(marker_path, [])?;
        Ok(())
    }

    fn clear_whiteout(&self, logical_path: &Path) -> Result<(), VfsError> {
        let marker_path = self.whiteout_marker_path(logical_path);
        self.validate_project_owned_path(&marker_path)?;
        if marker_path.exists() {
            fs::remove_file(marker_path)?;
        }
        Ok(())
    }

    fn is_whiteouted(&self, logical_path: &Path) -> Result<bool, VfsError> {
        let components = collect_normal_components(logical_path)?;

        if components.is_empty() {
            return Ok(false);
        }

        let mut prefix = PathBuf::new();
        for component in &components {
            let marker = self
                .whiteout_root
                .join(&prefix)
                .join(format!(".wh.{component}"));
            self.validate_project_owned_path(&marker)?;
            if marker.exists() {
                return Ok(true);
            }
            prefix.push(component);
        }

        Ok(false)
    }

    fn whiteout_marker_path(&self, logical_path: &Path) -> PathBuf {
        let parent = logical_path.parent().unwrap_or_else(|| Path::new(""));
        let name = logical_path.file_name().unwrap_or_default();
        self.whiteout_root
            .join(parent)
            .join(format!(".wh.{}", name.to_string_lossy()))
    }

    fn logical_path_exists(&self, logical_path: &Path) -> Result<bool, VfsError> {
        let category = classify_path(logical_path);
        if self.validate_upper_path(logical_path)?.exists() {
            return Ok(true);
        }

        if category.uses_whiteout() && self.is_whiteouted(logical_path)? {
            return Ok(false);
        }

        Ok(self
            .resolve_lower_path(logical_path)
            .is_some_and(|(lower_path, _)| lower_path.exists()))
    }

    fn copy_overlay_path(&self, from: &Path, to: &Path) -> Result<(), VfsError> {
        let resolved = self.resolve_physical_path(from)?;
        let target_upper = self.validate_upper_path(to)?;
        let metadata = fs::metadata(&resolved.physical_path)?;

        if metadata.is_dir() {
            if is_same_or_descendant_path(to, from)? {
                return Err(VfsError::PathDenied);
            }

            if target_upper.starts_with(&resolved.physical_path) {
                return Err(VfsError::PathDenied);
            }

            fs::create_dir_all(&target_upper)?;

            for entry in self.list_entries(from)? {
                let child_from = from.join(&entry.name);
                let child_to = to.join(&entry.name);
                self.copy_overlay_path(&child_from, &child_to)?;
            }
        } else {
            validate_physical_path(&resolved.physical_path, &resolved.canonical_root)?;
            copy_path(&resolved.physical_path, &target_upper)?;
        }

        self.clear_whiteout(to)?;
        Ok(())
    }

    fn ensure_directory_target_is_not_nested(
        &self,
        from: &Path,
        to: &Path,
    ) -> Result<(), VfsError> {
        if self.logical_path_is_directory(from)? && is_same_or_descendant_path(to, from)? {
            return Err(VfsError::PathDenied);
        }

        Ok(())
    }

    fn validate_upper_path(&self, logical_path: &Path) -> Result<PathBuf, VfsError> {
        let upper_path = self.upper.join(logical_path);
        self.validate_project_owned_path(&upper_path)?;
        Ok(upper_path)
    }

    fn validate_project_owned_path(&self, path: &Path) -> Result<(), VfsError> {
        let components = collect_normal_components(
            path.strip_prefix(&self.upper)
                .map_err(|_| VfsError::PathDenied)?,
        )?;
        let mut current = self.upper.clone();

        for component in components {
            current.push(component);
            if !current.exists() {
                continue;
            }

            let metadata = fs::symlink_metadata(&current)?;
            if metadata.file_type().is_symlink() {
                log::warn!("路径被拒绝（符号链接）: {}", current.display());
                return Err(VfsError::PathDenied);
            }

            validate_physical_path(&current, &self.upper_canonical)?;
        }

        Ok(())
    }
}

#[allow(dead_code)] // PR3 server 重构启用
pub fn sanitize_request_path(raw_path: &str) -> Result<PathBuf, VfsError> {
    let decoded = percent_decode_str(raw_path)
        .decode_utf8()
        .map_err(|_| VfsError::PathDenied)?;

    sanitize_path_like(decoded.as_ref(), true)
}

pub fn sanitize_logical_path(raw_path: &str) -> Result<PathBuf, VfsError> {
    sanitize_path_like(raw_path, false)
}

#[inline]
pub(crate) fn classify_path(path: &Path) -> PathCategory {
    let mut components = path.components();
    let first = match components.next() {
        Some(Component::Normal(segment)) => segment.to_str().unwrap_or(""),
        _ => return PathCategory::Unclassified,
    };

    match first {
        "index.html" | "assets" | "manifest.json" | "webgal-serviceworker.js" => {
            PathCategory::EngineRuntime
        }
        "icons" => PathCategory::EngineOverride,
        "game"
            if matches!(
                components.next(),
                Some(Component::Normal(segment)) if segment.to_str() == Some("template")
            ) =>
        {
            PathCategory::TemplateContent
        }
        "game" => PathCategory::GameContent,
        _ => PathCategory::Unclassified,
    }
}

pub fn read_project_config(project_path: &Path) -> AppResult<ProjectConfig> {
    let config_path = project_path.join(PROJECT_CONFIG_FILE);
    let content = fs::read_to_string(&config_path)?;
    let version = serde_json::from_str::<ProjectConfigVersionProbe>(&content)
        .map(|probe| probe.version)
        .map_err(invalid_project_config_parse_error)?;

    if version > CURRENT_SCHEMA_VERSION {
        return Err(AppError::SchemaVersionTooNew {
            found: version,
            max_supported: CURRENT_SCHEMA_VERSION,
        });
    }

    let config: ProjectConfig =
        serde_json::from_str(&content).map_err(invalid_project_config_parse_error)?;

    validate_project_config(&config)?;
    Ok(config)
}

pub async fn write_project_config(project_path: &Path, config: &ProjectConfig) -> AppResult<()> {
    validate_project_config(config)?;

    let content = serde_json::to_string_pretty(config)
        .map_err(|error| AppError::Config(format!("project.wgcp 序列化失败: {error}")))?;
    atomic_write(&project_path.join(PROJECT_CONFIG_FILE), content.as_bytes()).await?;
    Ok(())
}

pub fn resolve_default_template_path(engine_path: Option<&Path>) -> Option<PathBuf> {
    engine_path.map(|path| path.join("game").join("template"))
}

struct TemplatePaths {
    upper: PathBuf,
    whiteout_dir: PathBuf,
    whiteout_marker: PathBuf,
}

fn template_paths(project_path: &Path) -> TemplatePaths {
    let whiteout_base = project_path
        .join(VFS_METADATA_DIR)
        .join(WHITEOUTS_DIR)
        .join("game");

    TemplatePaths {
        upper: project_path.join("game").join("template"),
        whiteout_dir: whiteout_base.join("template"),
        whiteout_marker: whiteout_base.join(".wh.template"),
    }
}

/// 检查项目的模板子树是否被用户修改过
///
/// 脏状态命中条件：
/// 1. `game/template/` 下存在任何 upper 文件或目录
/// 2. `.wgc-vfs/whiteouts/` 下存在 `game/template/**` 相关 whiteout
pub fn is_template_dirty(project_path: &Path) -> Result<bool, VfsError> {
    let paths = template_paths(project_path);

    if paths.upper.is_dir() && has_any_content(&paths.upper)? {
        return Ok(true);
    }

    if paths.whiteout_dir.is_dir() && has_any_content(&paths.whiteout_dir)? {
        return Ok(true);
    }

    Ok(paths.whiteout_marker.exists())
}

/// 清理模板子树的所有 upper override 和相关 whiteout
///
/// 用于模板切换时重置用户对模板文件的全部修改。
pub fn clean_template_upper(project_path: &Path) -> Result<(), VfsError> {
    let paths = template_paths(project_path);

    if paths.upper.is_dir() {
        for entry in fs::read_dir(&paths.upper)? {
            remove_path(&entry?.path())?;
        }
    }

    if paths.whiteout_dir.is_dir() {
        fs::remove_dir_all(&paths.whiteout_dir)?;
    }

    if paths.whiteout_marker.exists() {
        fs::remove_file(&paths.whiteout_marker)?;
    }

    Ok(())
}

fn has_any_content(dir: &Path) -> Result<bool, VfsError> {
    Ok(fs::read_dir(dir)?.next().is_some())
}

fn validate_project_config(config: &ProjectConfig) -> AppResult<()> {
    if config.version == 0 {
        return Err(AppError::InvalidProjectConfig {
            reason: "version 字段无效".into(),
        });
    }

    if config.template.is_some() && config.engine.is_none() {
        return Err(AppError::InvalidProjectConfig {
            reason: "template 字段不能在缺少 engine 时出现".into(),
        });
    }

    Ok(())
}

fn invalid_project_config_parse_error(error: serde_json::Error) -> AppError {
    AppError::InvalidProjectConfig {
        reason: format!("project.wgcp 解析失败: {error}"),
    }
}

pub(crate) async fn atomic_write(target: &Path, content: &[u8]) -> std::io::Result<()> {
    let target = target.to_path_buf();
    let content = content.to_vec();

    tokio::task::spawn_blocking(move || {
        let parent = target
            .parent()
            .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "无父目录"))?;

        let mut file = NamedTempFile::new_in(parent)?;
        file.write_all(&content)?;
        file.flush()?;
        file.as_file().sync_all()?;
        file.persist(&target).map_err(|error| error.error)?;
        Ok(())
    })
    .await
    .map_err(std::io::Error::other)?
}

fn sanitize_path_like(raw_path: &str, empty_maps_to_index: bool) -> Result<PathBuf, VfsError> {
    if raw_path.contains('\0') || raw_path.contains('\\') || raw_path.contains("//") {
        log::warn!("路径被拒绝（非法字符）: {raw_path:?}");
        return Err(VfsError::PathDenied);
    }

    let trimmed = raw_path.trim_start_matches('/');
    if trimmed.is_empty() {
        return if empty_maps_to_index {
            Ok(PathBuf::from("index.html"))
        } else {
            Ok(PathBuf::new())
        };
    }

    let path = Path::new(trimmed);
    let mut normalized = PathBuf::new();

    for component in path.components() {
        match component {
            Component::Normal(segment) => {
                let segment = segment.to_str().ok_or(VfsError::PathDenied)?;
                validate_path_segment(segment)?;
                normalized.push(segment);
            }
            _ => return Err(VfsError::PathDenied),
        }
    }

    if is_internal_metadata_path(&normalized) {
        return Err(VfsError::PathDenied);
    }

    Ok(normalized)
}

fn validate_path_segment(segment: &str) -> Result<(), VfsError> {
    if segment.is_empty()
        || segment.contains(':')
        || segment.ends_with('.')
        || segment.ends_with(' ')
    {
        log::warn!("路径段被拒绝（无效格式）: {segment:?}");
        return Err(VfsError::PathDenied);
    }

    let upper = segment.split('.').next().unwrap_or("").to_ascii_uppercase();
    const RESERVED: &[&str] = &[
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];

    if RESERVED.contains(&upper.as_str()) {
        log::warn!("路径段被拒绝（Windows 保留名称）: {segment:?}");
        return Err(VfsError::PathDenied);
    }

    Ok(())
}

fn is_internal_metadata_path(path: &Path) -> bool {
    let mut components = path.components();
    let Some(Component::Normal(first)) = components.next() else {
        return false;
    };
    let Some(first) = first.to_str() else {
        return false;
    };

    matches!(first, VFS_METADATA_DIR | PROJECT_CONFIG_FILE)
}

fn validate_physical_path(physical_path: &Path, root_canonical: &Path) -> Result<(), VfsError> {
    let canonical = if physical_path.exists() {
        physical_path.canonicalize()?
    } else {
        let parent = physical_path.parent().ok_or(VfsError::PathDenied)?;
        let file_name = physical_path.file_name().ok_or(VfsError::PathDenied)?;
        parent.canonicalize()?.join(file_name)
    };

    if !canonical.starts_with(root_canonical) {
        log::warn!(
            "路径逃逸被阻止: {} 不在 {} 之内",
            canonical.display(),
            root_canonical.display()
        );
        return Err(VfsError::PathDenied);
    }

    Ok(())
}

/// 读取请求的快速路径校验：使用字符串前缀检查代替 canonicalize
///
/// 前提：root_canonical 在站点注册时已缓存，且根目录内不含指向外部的符号链接。
/// 仅适用于读取请求，写入请求仍需完整的 canonicalize 校验。
fn validate_read_path_fast(physical_path: &Path, root_canonical: &Path) -> Result<(), VfsError> {
    if physical_path.starts_with(root_canonical) {
        return Ok(());
    }
    validate_physical_path(physical_path, root_canonical)
}

fn copy_path(source: &Path, destination: &Path) -> Result<(), VfsError> {
    ensure_parent_dir(destination)?;

    if source.is_dir() {
        copy_dir_recursive(source, destination)?;
    } else {
        fs::copy(source, destination)?;
    }

    Ok(())
}

fn copy_dir_recursive(source: &Path, destination: &Path) -> Result<(), VfsError> {
    fs::create_dir_all(destination)?;

    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());

        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&source_path, &destination_path)?;
        } else {
            fs::copy(source_path, destination_path)?;
        }
    }

    Ok(())
}

fn remove_path(path: &Path) -> Result<(), VfsError> {
    if path.is_dir() {
        fs::remove_dir_all(path)?;
    } else {
        fs::remove_file(path)?;
    }

    Ok(())
}

fn ensure_parent_dir(path: &Path) -> Result<(), VfsError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    Ok(())
}

fn already_exists_error() -> VfsError {
    VfsError::Io(std::io::Error::new(
        ErrorKind::AlreadyExists,
        "目标路径已存在",
    ))
}

fn strip_template_prefix(path: &Path) -> Option<&Path> {
    path.strip_prefix(Path::new("game").join("template")).ok()
}

fn join_logical(parent: &Path, child: &str) -> PathBuf {
    if parent.as_os_str().is_empty() {
        PathBuf::from(child)
    } else {
        parent.join(child)
    }
}

fn collect_normal_components(path: &Path) -> Result<Vec<String>, VfsError> {
    path.components()
        .map(|component| match component {
            Component::Normal(segment) => segment
                .to_str()
                .map(String::from)
                .ok_or(VfsError::PathDenied),
            _ => Err(VfsError::PathDenied),
        })
        .collect()
}

fn is_same_or_descendant_path(path: &Path, base: &Path) -> Result<bool, VfsError> {
    let path_components = collect_normal_components(path)?;
    let base_components = collect_normal_components(base)?;

    if base_components.len() > path_components.len() {
        return Ok(false);
    }

    Ok(path_components
        .iter()
        .zip(base_components.iter())
        .all(|(path_component, base_component)| path_component == base_component))
}

#[cfg(test)]
mod tests {
    use super::{
        classify_path, read_project_config, sanitize_logical_path, sanitize_request_path,
        validate_project_config, AppError, EngineRef, OverlayFs, PathCategory, ProjectConfig,
        TemplateBinding, VfsDirEntry, VfsError, VfsSource,
    };
    #[cfg(windows)]
    use std::process::Command;
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    fn create_temp_dir(prefix: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("{prefix}-{unique}"));
        fs::create_dir_all(&dir).expect("temp directory should be created");
        dir
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

    #[test]
    fn sanitize_request_path_maps_root_to_index_html() {
        assert_eq!(
            sanitize_request_path("").expect("empty path should map to index.html"),
            PathBuf::from("index.html")
        );
        assert_eq!(
            sanitize_request_path("/").expect("root path should map to index.html"),
            PathBuf::from("index.html")
        );
    }

    #[test]
    fn sanitize_request_path_rejects_path_traversal_and_reserved_names() {
        assert!(sanitize_request_path("../secret.txt").is_err());
        assert!(sanitize_request_path("icons\\favicon.ico").is_err());
        assert!(sanitize_request_path("CON").is_err());
        assert!(sanitize_request_path("assets:evil").is_err());
    }

    #[test]
    fn sanitize_logical_path_keeps_empty_path_for_directory_listing() {
        assert_eq!(
            sanitize_logical_path("").expect("empty logical path should stay empty"),
            PathBuf::new()
        );
    }

    #[test]
    fn classify_path_matches_phase_one_contract() {
        assert_eq!(
            classify_path(Path::new("index.html")),
            PathCategory::EngineRuntime
        );
        assert_eq!(
            classify_path(Path::new("assets/js/main.js")),
            PathCategory::EngineRuntime
        );
        assert_eq!(
            classify_path(Path::new("manifest.json")),
            PathCategory::EngineRuntime
        );
        assert_eq!(
            classify_path(Path::new("icons/favicon.ico")),
            PathCategory::EngineOverride
        );
        assert_eq!(
            classify_path(Path::new("game/template/start.txt")),
            PathCategory::TemplateContent
        );
        assert_eq!(
            classify_path(Path::new("game/scene/start.txt")),
            PathCategory::GameContent
        );
    }

    #[test]
    fn validate_project_config_rejects_template_without_engine() {
        let config = ProjectConfig {
            engine: None,
            template: Some(TemplateBinding::Standalone {
                name: "Modern".into(),
            }),
            version: 1,
        };

        assert!(matches!(
            validate_project_config(&config),
            Err(AppError::InvalidProjectConfig { .. })
        ));
    }

    #[test]
    fn read_project_config_rejects_future_schema_version() {
        let dir = create_temp_dir("webgal-craft-project-config");
        fs::write(
            dir.join("project.wgcp"),
            r#"{"version":99,"engine":{"name":"WebGAL","version":"4.5.0"}}"#,
        )
        .expect("project config should be written");

        let error = read_project_config(&dir).expect_err("future schema version should fail");
        assert!(matches!(error, AppError::SchemaVersionTooNew { .. }));
    }

    #[test]
    fn read_project_config_reports_future_schema_before_shape_validation() {
        let dir = create_temp_dir("webgal-craft-project-config-future-shape");
        fs::write(
            dir.join("project.wgcp"),
            r#"{
              "version": 99,
              "engine": "future-schema"
            }"#,
        )
        .expect("project config should be written");

        let error = read_project_config(&dir)
            .expect_err("future schema should not be downgraded to invalid config");
        assert!(matches!(error, AppError::SchemaVersionTooNew { .. }));
    }

    #[test]
    fn read_project_config_parses_full_structure() {
        let dir = create_temp_dir("webgal-craft-project-config-full");
        fs::write(
            dir.join("project.wgcp"),
            r#"{
              "version": 1,
              "engine": { "id": "open-webgal.webgal", "version": "4.5.0" },
              "template": {
                "kind": "engineBuiltin",
                "engine": { "id": "open-webgal.webgal", "version": "4.5.0" }
              }
            }"#,
        )
        .expect("project config should be written");

        let config = read_project_config(&dir).expect("project config should parse");

        assert_eq!(
            config.engine,
            Some(EngineRef {
                id: "open-webgal.webgal".into(),
                version: Some("4.5.0".into()),
            })
        );
        assert!(matches!(
            config.template,
            Some(TemplateBinding::EngineBuiltin { .. })
        ));
    }

    #[test]
    fn read_project_config_reports_invalid_project_config_for_parse_errors() {
        let dir = create_temp_dir("webgal-craft-project-config-invalid");
        fs::write(dir.join("project.wgcp"), r#"{"version":"broken"}"#)
            .expect("project config should be written");

        let error = read_project_config(&dir).expect_err("invalid config should fail");
        assert!(matches!(error, AppError::InvalidProjectConfig { .. }));
    }

    #[test]
    fn list_entries_includes_template_children() {
        let upper = create_temp_dir("webgal-craft-vfs-upper");
        let engine = create_temp_dir("webgal-craft-vfs-engine");

        fs::create_dir_all(engine.join("game").join("template"))
            .expect("template directory should be created");
        fs::write(
            engine.join("game").join("template").join("style.css"),
            "body {}",
        )
        .expect("template file should be written");

        let overlay = OverlayFs::new(
            upper,
            Some(engine.clone()),
            Some(engine.join("game").join("template")),
        )
        .expect("overlay should be created");

        let entries = overlay
            .list_entries(Path::new("game/template"))
            .expect("template entries should be listed");

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "style.css");
    }

    #[test]
    fn resolve_physical_path_prefers_engine_runtime_lower_over_upper() {
        let upper = create_temp_dir("webgal-craft-vfs-runtime-upper");
        let engine = create_temp_dir("webgal-craft-vfs-runtime-engine");

        fs::create_dir_all(engine.join("game").join("template"))
            .expect("template directory should be created");
        fs::write(upper.join("manifest.json"), "{\"name\":\"upper\"}")
            .expect("upper manifest should be written");
        fs::write(engine.join("manifest.json"), "{\"name\":\"engine\"}")
            .expect("engine manifest should be written");

        let overlay = OverlayFs::new(
            upper,
            Some(engine.clone()),
            Some(engine.join("game").join("template")),
        )
        .expect("overlay should be created");

        let resolved = overlay
            .resolve_physical_path(Path::new("manifest.json"))
            .expect("manifest should resolve from engine lower");

        assert_eq!(resolved.physical_path, engine.join("manifest.json"));
        assert_eq!(
            resolved.canonical_root,
            engine.canonicalize().expect("engine should canonicalize")
        );
    }

    #[test]
    fn list_entries_ignores_upper_engine_runtime_and_unclassified_entries() {
        let upper = create_temp_dir("webgal-craft-vfs-root-upper");
        let engine = create_temp_dir("webgal-craft-vfs-root-engine");

        fs::create_dir_all(engine.join("game").join("template"))
            .expect("template directory should be created");
        fs::write(upper.join("manifest.json"), "{\"name\":\"upper\"}")
            .expect("upper manifest should be written");
        fs::write(upper.join("notes.txt"), "upper only")
            .expect("upper unclassified file should be written");
        fs::write(engine.join("manifest.json"), "{\"name\":\"engine\"}")
            .expect("engine manifest should be written");

        let overlay = OverlayFs::new(
            upper,
            Some(engine.clone()),
            Some(engine.join("game").join("template")),
        )
        .expect("overlay should be created");

        let entries = overlay
            .list_entries(Path::new(""))
            .expect("root entries should be listed");

        assert!(
            entries.iter().any(|entry| entry.name == "manifest.json"),
            "manifest should be visible"
        );
        assert!(!entries.iter().any(|entry| entry.name == "notes.txt"));
    }

    #[test]
    fn ensure_writable_does_not_materialize_engine_override_files() {
        let upper = create_temp_dir("webgal-craft-vfs-icons-upper");
        let engine = create_temp_dir("webgal-craft-vfs-icons-engine");

        fs::create_dir_all(engine.join("game").join("template"))
            .expect("template directory should be created");
        fs::create_dir_all(engine.join("icons")).expect("icons directory should be created");
        fs::write(engine.join("icons").join("favicon.ico"), "lower icon")
            .expect("engine icon should be written");

        let overlay = OverlayFs::new(
            upper.clone(),
            Some(engine.clone()),
            Some(engine.join("game").join("template")),
        )
        .expect("overlay should be created");

        let writable_path = overlay
            .ensure_writable(Path::new("icons/favicon.ico"))
            .expect("engine override should resolve to upper path");

        assert_eq!(writable_path, upper.join("icons").join("favicon.ico"));
        assert!(!writable_path.exists());
    }

    #[test]
    fn ensure_writable_rejects_linked_upper_parent_chain() {
        let upper = create_temp_dir("webgal-craft-vfs-linked-upper");
        let engine = create_temp_dir("webgal-craft-vfs-linked-engine");
        let escape = create_temp_dir("webgal-craft-vfs-linked-escape");

        fs::create_dir_all(upper.join("game")).expect("upper game dir should exist");
        fs::create_dir_all(engine.join("game").join("template"))
            .expect("template directory should be created");
        create_dir_link(&escape, &upper.join("game").join("scene"));

        let overlay = OverlayFs::new(
            upper,
            Some(engine.clone()),
            Some(engine.join("game").join("template")),
        )
        .expect("overlay should be created");

        let error = overlay
            .ensure_writable(Path::new("game/scene/start.txt"))
            .expect_err("linked parent chain should be rejected");

        assert!(matches!(error, VfsError::PathDenied));
        assert!(
            !escape.join("start.txt").exists(),
            "materialize should not escape through a linked parent directory"
        );
    }

    #[test]
    fn remove_logical_path_on_engine_override_reveals_engine_lower_again() {
        let upper = create_temp_dir("webgal-craft-vfs-icons-remove-upper");
        let engine = create_temp_dir("webgal-craft-vfs-icons-remove-engine");

        fs::create_dir_all(engine.join("game").join("template"))
            .expect("template directory should be created");
        fs::create_dir_all(engine.join("icons")).expect("engine icons directory should be created");
        fs::create_dir_all(upper.join("icons")).expect("upper icons directory should be created");
        fs::write(engine.join("icons").join("favicon.ico"), "engine icon")
            .expect("engine icon should be written");
        fs::write(upper.join("icons").join("favicon.ico"), "upper icon")
            .expect("upper icon should be written");

        let overlay = OverlayFs::new(
            upper,
            Some(engine.clone()),
            Some(engine.join("game").join("template")),
        )
        .expect("overlay should be created");

        overlay
            .remove_logical_path(Path::new("icons/favicon.ico"))
            .expect("deleting upper override should fall back to lower");

        let resolved = overlay
            .resolve_physical_path(Path::new("icons/favicon.ico"))
            .expect("engine icon should be visible again");

        assert_eq!(
            resolved.physical_path,
            engine.join("icons").join("favicon.ico")
        );
        assert_eq!(
            resolved.canonical_root,
            engine.canonicalize().expect("engine should canonicalize")
        );
    }

    #[test]
    fn ensure_writable_for_game_content_ignores_engine_lower() {
        let upper = create_temp_dir("webgal-craft-vfs-whiteout-upper");
        let engine = create_temp_dir("webgal-craft-vfs-whiteout-engine");

        fs::create_dir_all(engine.join("game").join("scene"))
            .expect("scene directory should be created");
        fs::create_dir_all(engine.join("game").join("template"))
            .expect("template directory should be created");
        fs::write(
            engine.join("game").join("scene").join("start.txt"),
            "lower scene",
        )
        .expect("scene file should be written");

        let overlay = OverlayFs::new(
            upper.clone(),
            Some(engine.clone()),
            Some(engine.join("game").join("template")),
        )
        .expect("overlay should be created");

        let writable_path = overlay
            .ensure_writable(Path::new("game/scene/start.txt"))
            .expect("game content should become writable in upper");

        assert_eq!(
            writable_path,
            upper.join("game").join("scene").join("start.txt")
        );
        assert!(
            !writable_path.exists(),
            "GameContent no longer materializes engine lower files"
        );
        assert!(
            writable_path
                .parent()
                .expect("writable path should have a parent")
                .is_dir(),
            "ensure_writable should create the target parent directory"
        );
        assert!(matches!(
            overlay.resolve_physical_path(Path::new("game/scene/start.txt")),
            Err(VfsError::NotFound)
        ));
    }

    #[test]
    fn remove_logical_path_rejects_linked_whiteout_parent_chain() {
        let upper = create_temp_dir("webgal-craft-vfs-whiteout-link-upper");
        let engine = create_temp_dir("webgal-craft-vfs-whiteout-link-engine");
        let escape = create_temp_dir("webgal-craft-vfs-whiteout-link-escape");

        fs::create_dir_all(engine.join("game").join("scene"))
            .expect("scene directory should be created");
        fs::create_dir_all(engine.join("game").join("template"))
            .expect("template directory should be created");
        fs::write(
            engine.join("game").join("scene").join("start.txt"),
            "lower scene",
        )
        .expect("scene file should be written");
        create_dir_link(&escape, &upper.join(".wgc-vfs"));

        let overlay = OverlayFs::new(
            upper,
            Some(engine.clone()),
            Some(engine.join("game").join("template")),
        )
        .expect("overlay should be created");

        let error = overlay
            .remove_logical_path(Path::new("game/scene/start.txt"))
            .expect_err("linked whiteout metadata path should be rejected");

        assert!(matches!(error, VfsError::PathDenied));
        assert!(
            !escape
                .join("whiteouts")
                .join("game")
                .join("scene")
                .join(".wh.start.txt")
                .exists(),
            "whiteout writes should not escape through linked metadata directories"
        );
    }

    #[test]
    fn copy_logical_path_uses_overlay_view_for_template_directories() {
        let upper = create_temp_dir("webgal-craft-vfs-copy-upper");
        let engine = create_temp_dir("webgal-craft-vfs-copy-engine");

        fs::create_dir_all(engine.join("game").join("template").join("scene"))
            .expect("template directory should be created");
        fs::write(
            engine
                .join("game")
                .join("template")
                .join("scene")
                .join("a.txt"),
            "A",
        )
        .expect("visible lower file should be written");
        fs::write(
            engine
                .join("game")
                .join("template")
                .join("scene")
                .join("b.txt"),
            "B",
        )
        .expect("hidden lower file should be written");

        let overlay = OverlayFs::new(
            upper.clone(),
            Some(engine.clone()),
            Some(engine.join("game").join("template")),
        )
        .expect("overlay should be created");

        overlay
            .remove_logical_path(Path::new("game/template/scene/b.txt"))
            .expect("lower file should be whiteouted");
        overlay
            .copy_logical_path(
                Path::new("game/template/scene"),
                Path::new("game/template/scene-copy"),
            )
            .expect("directory copy should succeed");

        assert!(upper
            .join("game")
            .join("template")
            .join("scene-copy")
            .join("a.txt")
            .is_file());
        assert!(!upper
            .join("game")
            .join("template")
            .join("scene-copy")
            .join("b.txt")
            .exists());
    }

    #[test]
    fn copy_logical_path_rejects_moving_directory_into_its_own_descendant() {
        let upper = create_temp_dir("webgal-craft-vfs-copy-descendant-upper");
        let engine = create_temp_dir("webgal-craft-vfs-copy-descendant-engine");

        fs::create_dir_all(upper.join("game").join("scene"))
            .expect("scene directory should be created");
        fs::create_dir_all(engine.join("game").join("template"))
            .expect("template directory should be created");
        fs::write(upper.join("game").join("scene").join("start.txt"), "scene")
            .expect("scene file should be written");

        let overlay = OverlayFs::new(
            upper,
            Some(engine.clone()),
            Some(engine.join("game").join("template")),
        )
        .expect("overlay should be created");

        let error = overlay
            .copy_logical_path(Path::new("game/scene"), Path::new("game/scene/nested"))
            .expect_err("copying a directory into its own descendant should be rejected");

        assert!(matches!(error, VfsError::PathDenied));
    }

    #[test]
    fn rename_logical_path_preserves_template_lower_children_for_partially_materialized_directories(
    ) {
        let upper = create_temp_dir("webgal-craft-vfs-rename-mixed-upper");
        let engine = create_temp_dir("webgal-craft-vfs-rename-mixed-engine");

        fs::create_dir_all(upper.join("game").join("template").join("scene"))
            .expect("upper scene directory should be created");
        fs::create_dir_all(engine.join("game").join("template").join("scene"))
            .expect("template directory should be created");

        fs::write(
            upper
                .join("game")
                .join("template")
                .join("scene")
                .join("edited.txt"),
            "upper scene",
        )
        .expect("upper scene file should be written");
        fs::write(
            engine
                .join("game")
                .join("template")
                .join("scene")
                .join("lower.txt"),
            "lower scene",
        )
        .expect("engine scene file should be written");

        let overlay = OverlayFs::new(
            upper.clone(),
            Some(engine.clone()),
            Some(engine.join("game").join("template")),
        )
        .expect("overlay should be created");

        overlay
            .rename_logical_path(
                Path::new("game/template/scene"),
                Path::new("game/template/scene-renamed"),
            )
            .expect("directory rename should succeed");

        assert!(upper
            .join("game")
            .join("template")
            .join("scene-renamed")
            .join("edited.txt")
            .is_file());
        assert!(upper
            .join("game")
            .join("template")
            .join("scene-renamed")
            .join("lower.txt")
            .is_file());
        assert!(!upper.join("game").join("template").join("scene").exists());
        assert!(matches!(
            overlay.resolve_physical_path(Path::new("game/template/scene/lower.txt")),
            Err(VfsError::NotFound)
        ));
    }

    #[test]
    fn rename_logical_path_rejects_moving_directory_into_its_own_descendant() {
        let upper = create_temp_dir("webgal-craft-vfs-rename-descendant-upper");
        let engine = create_temp_dir("webgal-craft-vfs-rename-descendant-engine");

        fs::create_dir_all(upper.join("game").join("scene"))
            .expect("scene directory should be created");
        fs::create_dir_all(engine.join("game").join("template"))
            .expect("template directory should be created");
        fs::write(upper.join("game").join("scene").join("start.txt"), "scene")
            .expect("scene file should be written");

        let overlay = OverlayFs::new(
            upper,
            Some(engine.clone()),
            Some(engine.join("game").join("template")),
        )
        .expect("overlay should be created");

        let error = overlay
            .rename_logical_path(Path::new("game/scene"), Path::new("game/scene/nested"))
            .expect_err("moving a directory into its own descendant should be rejected");

        assert!(matches!(error, VfsError::PathDenied));
    }

    #[test]
    fn rename_logical_path_rejects_engine_runtime_source() {
        let upper = create_temp_dir("webgal-craft-vfs-rename-upper");
        let engine = create_temp_dir("webgal-craft-vfs-rename-engine");

        fs::create_dir_all(engine.join("game").join("template"))
            .expect("template directory should be created");
        fs::write(engine.join("index.html"), "<html></html>")
            .expect("runtime file should be written");

        let overlay = OverlayFs::new(
            upper,
            Some(engine.clone()),
            Some(engine.join("game").join("template")),
        )
        .expect("overlay should be created");

        let error = overlay
            .rename_logical_path(Path::new("index.html"), Path::new("game/index.html"))
            .expect_err("engine runtime source should be rejected");

        assert!(matches!(error, VfsError::WriteToEngineRuntime));
    }

    #[test]
    fn remove_logical_path_rejects_lower_only_engine_override() {
        let upper = create_temp_dir("webgal-craft-vfs-lower-only-icons-upper");
        let engine = create_temp_dir("webgal-craft-vfs-lower-only-icons-engine");

        fs::create_dir_all(engine.join("game").join("template"))
            .expect("template directory should be created");
        fs::create_dir_all(engine.join("icons")).expect("icons directory should be created");
        fs::write(engine.join("icons").join("favicon.ico"), "lower icon")
            .expect("engine icon should be written");

        let overlay = OverlayFs::new(
            upper,
            Some(engine.clone()),
            Some(engine.join("game").join("template")),
        )
        .expect("overlay should be created");

        let error = overlay
            .remove_logical_path(Path::new("icons/favicon.ico"))
            .expect_err("lower-only engine override deletion should be rejected");

        assert!(matches!(error, VfsError::WriteToEngineRuntime));
    }

    #[test]
    fn vfs_dir_entry_serializes_with_camel_case_fields() {
        let entry = VfsDirEntry {
            name: String::from("scene"),
            is_dir: true,
            source: VfsSource::Upper,
        };

        let serialized =
            serde_json::to_value(&entry).expect("vfs dir entry should serialize to json value");

        assert_eq!(
            serialized.get("name").and_then(serde_json::Value::as_str),
            Some("scene")
        );
        assert_eq!(
            serialized.get("isDir").and_then(serde_json::Value::as_bool),
            Some(true)
        );
        assert_eq!(
            serialized.get("source").and_then(serde_json::Value::as_str),
            Some("upper")
        );
        assert!(
            serialized.get("is_dir").is_none(),
            "frontend contract should not leak Rust snake_case fields"
        );
    }
}
