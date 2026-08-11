use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::{self, Read},
    path::{Component, Path, PathBuf},
};

use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use tauri::State;
use tempfile::{Builder as TempDirBuilder, TempDir};
use tokio::sync::Mutex;
use zip::ZipArchive;

use super::{AppError, AppResult};

const MAX_ARCHIVE_BYTES: u64 = 1024 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES: usize = 100_000;
const MAX_EXTRACTED_BYTES: u64 = 4 * 1024 * 1024 * 1024;

#[derive(Default)]
pub struct ArchiveImportState {
    sessions: Mutex<HashMap<String, TempDir>>,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ArchiveResourceKind {
    Engine,
    Template,
}

impl ArchiveResourceKind {
    fn manifest_name(self) -> &'static str {
        match self {
            Self::Engine => "webgal-engine.json",
            Self::Template => "template.json",
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveImportSession {
    root_path: String,
    session_id: String,
}

enum ArchiveFormat {
    Zip,
    Tar,
    TarGz,
}

impl ArchiveFormat {
    fn from_path(path: &Path) -> AppResult<Self> {
        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();

        if file_name.ends_with(".tar.gz") || file_name.ends_with(".tgz") {
            Ok(Self::TarGz)
        } else if file_name.ends_with(".zip") {
            Ok(Self::Zip)
        } else if file_name.ends_with(".tar") {
            Ok(Self::Tar)
        } else {
            Err(AppError::UnsupportedArchive(
                "仅支持 ZIP、TAR、TAR.GZ 和 TGZ".into(),
            ))
        }
    }
}

#[derive(Debug)]
struct ExtractedArchive {
    root_path: PathBuf,
    session_id: String,
    temp_dir: TempDir,
}

fn validate_archive_path(path: &Path) -> AppResult<()> {
    if !path.is_absolute() || !path.is_file() {
        return Err(AppError::InvalidArchive("请选择有效的压缩包文件".into()));
    }

    let archive_size = fs::metadata(path)?.len();
    if archive_size > MAX_ARCHIVE_BYTES {
        return Err(AppError::ArchiveResourceLimit(
            "压缩包大小超过 1 GiB".into(),
        ));
    }
    Ok(())
}

fn validate_entry_path(path: &Path) -> AppResult<PathBuf> {
    let mut relative = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(segment) => relative.push(segment),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(AppError::UnsafeArchiveEntry(
                    "条目路径试图离开解压目录".into(),
                ));
            }
        }
    }

    if relative.as_os_str().is_empty() {
        return Err(AppError::UnsafeArchiveEntry("条目路径为空".into()));
    }
    Ok(relative)
}

fn reserve_entry(seen: &mut HashSet<PathBuf>, path: &Path) -> AppResult<()> {
    if !seen.insert(path.to_owned()) {
        return Err(AppError::InvalidArchive("压缩包包含重复路径".into()));
    }
    Ok(())
}

fn copy_limited<R: Read>(
    input: &mut R,
    output: &mut File,
    extracted_bytes: &mut u64,
) -> AppResult<()> {
    let remaining = MAX_EXTRACTED_BYTES.saturating_sub(*extracted_bytes);
    let written = io::copy(&mut input.take(remaining + 1), output)?;
    if written > remaining {
        return Err(AppError::ArchiveResourceLimit(
            "解压后内容超过 4 GiB".into(),
        ));
    }
    *extracted_bytes += written;
    Ok(())
}

fn collect_resource_root(path: &Path, manifest_name: &str, roots: &mut Vec<PathBuf>) {
    if path.file_name().is_some_and(|name| name == manifest_name) {
        roots.push(path.parent().unwrap_or(path).to_owned());
    }
}

fn extract_zip(path: &Path, destination: &Path, manifest_name: &str) -> AppResult<Vec<PathBuf>> {
    let file = File::open(path)?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| AppError::InvalidArchive(error.to_string()))?;
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(AppError::ArchiveResourceLimit(
            "压缩包条目数超过 100000".into(),
        ));
    }

    let mut extracted_bytes = 0;
    let mut seen = HashSet::new();
    let mut roots = Vec::new();
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| AppError::InvalidArchive(error.to_string()))?;
        let enclosed_name = entry
            .enclosed_name()
            .ok_or_else(|| AppError::UnsafeArchiveEntry("条目路径无效".into()))?;
        let relative_path = validate_entry_path(&enclosed_name)?;
        reserve_entry(&mut seen, &relative_path)?;

        let mode_type = entry.unix_mode().map(|mode| mode & 0o170000).unwrap_or(0);
        if mode_type != 0 && mode_type != 0o040000 && mode_type != 0o100000 {
            return Err(AppError::UnsafeArchiveEntry(
                "不支持符号链接或其他特殊文件".into(),
            ));
        }

        let output_path = destination.join(&relative_path);
        if entry.is_dir() {
            fs::create_dir_all(output_path)?;
        } else if entry.is_file() {
            if let Some(parent) = output_path.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut output = File::create(output_path)?;
            copy_limited(&mut entry, &mut output, &mut extracted_bytes)?;
            collect_resource_root(&destination.join(relative_path), manifest_name, &mut roots);
        } else {
            return Err(AppError::UnsafeArchiveEntry(
                "不支持压缩包中的特殊文件".into(),
            ));
        }
    }
    Ok(roots)
}

fn extract_tar<R: Read>(
    reader: R,
    destination: &Path,
    manifest_name: &str,
) -> AppResult<Vec<PathBuf>> {
    let mut archive = tar::Archive::new(reader);
    let entries = archive
        .entries()
        .map_err(|error| AppError::InvalidArchive(error.to_string()))?;
    let mut extracted_bytes = 0;
    let mut entry_count = 0;
    let mut seen = HashSet::new();
    let mut roots = Vec::new();

    for entry in entries {
        entry_count += 1;
        if entry_count > MAX_ARCHIVE_ENTRIES {
            return Err(AppError::ArchiveResourceLimit(
                "压缩包条目数超过 100000".into(),
            ));
        }

        let mut entry = entry.map_err(|error| AppError::InvalidArchive(error.to_string()))?;
        let relative_path = validate_entry_path(
            &entry
                .path()
                .map_err(|error| AppError::InvalidArchive(error.to_string()))?,
        )?;
        reserve_entry(&mut seen, &relative_path)?;
        let output_path = destination.join(&relative_path);
        let entry_type = entry.header().entry_type();

        if entry_type.is_dir() {
            fs::create_dir_all(output_path)?;
        } else if entry_type.is_file() {
            if let Some(parent) = output_path.parent() {
                fs::create_dir_all(parent)?;
            }
            let mut output = File::create(output_path)?;
            copy_limited(&mut entry, &mut output, &mut extracted_bytes)?;
            collect_resource_root(&destination.join(relative_path), manifest_name, &mut roots);
        } else {
            return Err(AppError::UnsafeArchiveEntry(
                "不支持符号链接或其他特殊文件".into(),
            ));
        }
    }
    Ok(roots)
}

fn extract_archive(path: &Path, kind: ArchiveResourceKind) -> AppResult<ExtractedArchive> {
    validate_archive_path(path)?;
    let format = ArchiveFormat::from_path(path)?;
    let temp_dir = TempDirBuilder::new()
        .prefix("webgalcraft-archive-import-")
        .tempdir()?;
    let payload_path = temp_dir.path().join("payload");
    fs::create_dir(&payload_path)?;

    let roots = match format {
        ArchiveFormat::Zip => extract_zip(path, &payload_path, kind.manifest_name())?,
        ArchiveFormat::Tar => extract_tar(File::open(path)?, &payload_path, kind.manifest_name())?,
        ArchiveFormat::TarGz => extract_tar(
            GzDecoder::new(File::open(path)?),
            &payload_path,
            kind.manifest_name(),
        )?,
    };
    let root_path = match roots.as_slice() {
        [root] => root.clone(),
        [] => {
            return Err(AppError::InvalidArchiveStructure(format!(
                "未找到 {}",
                kind.manifest_name()
            )));
        }
        _ => {
            return Err(AppError::InvalidArchiveStructure(format!(
                "找到多个 {}",
                kind.manifest_name()
            )));
        }
    };
    let session_id = temp_dir
        .path()
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| AppError::Io(io::Error::other("临时目录名称无效")))?
        .to_owned();

    Ok(ExtractedArchive {
        root_path,
        session_id,
        temp_dir,
    })
}

#[tauri::command]
pub async fn extract_resource_archive(
    state: State<'_, ArchiveImportState>,
    archive_path: String,
    kind: ArchiveResourceKind,
) -> AppResult<ArchiveImportSession> {
    let extracted =
        tokio::task::spawn_blocking(move || extract_archive(Path::new(&archive_path), kind))
            .await
            .map_err(|error| AppError::Io(io::Error::other(error)))??;
    let result = ArchiveImportSession {
        root_path: extracted.root_path.to_string_lossy().into_owned(),
        session_id: extracted.session_id.clone(),
    };
    state
        .sessions
        .lock()
        .await
        .insert(extracted.session_id, extracted.temp_dir);
    Ok(result)
}

#[tauri::command]
pub async fn cleanup_resource_archive(
    state: State<'_, ArchiveImportState>,
    session_id: String,
) -> AppResult<()> {
    let temp_dir = state
        .sessions
        .lock()
        .await
        .remove(&session_id)
        .ok_or_else(|| AppError::InvalidArchive("解包会话不存在或已清理".into()))?;
    tokio::task::spawn_blocking(move || temp_dir.close())
        .await
        .map_err(|error| AppError::Io(io::Error::other(error)))??;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use flate2::{write::GzEncoder, Compression};
    use tempfile::tempdir;
    use zip::{write::SimpleFileOptions, ZipWriter};

    use super::*;

    fn create_zip(path: &Path, entries: &[(&str, &[u8])]) {
        let mut archive = ZipWriter::new(File::create(path).expect("zip file should be created"));
        for (name, content) in entries {
            archive
                .start_file(*name, SimpleFileOptions::default())
                .expect("zip entry should start");
            archive
                .write_all(content)
                .expect("zip entry should be written");
        }
        archive.finish().expect("zip should finish");
    }

    fn create_tar(path: &Path, entry_path: &str, content: &[u8]) {
        let mut archive =
            tar::Builder::new(File::create(path).expect("tar file should be created"));
        let mut header = tar::Header::new_gnu();
        header.set_size(content.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        archive
            .append_data(&mut header, entry_path, content)
            .expect("tar entry should be written");
        archive.finish().expect("tar should finish");
    }

    fn create_tar_gz(path: &Path, entry_path: &str, content: &[u8]) {
        let encoder = GzEncoder::new(
            File::create(path).expect("gzip file should be created"),
            Compression::default(),
        );
        let mut archive = tar::Builder::new(encoder);
        let mut header = tar::Header::new_gnu();
        header.set_size(content.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        archive
            .append_data(&mut header, entry_path, content)
            .expect("tar entry should be written");
        archive.finish().expect("tar should finish");
    }

    #[test]
    fn extracts_zip_and_resolves_wrapped_engine_root() {
        let root = tempdir().expect("temp directory should be created");
        let archive_path = root.path().join("engine.zip");
        create_zip(
            &archive_path,
            &[
                ("WebGAL/webgal-engine.json", br#"{"name":"WebGAL"}"#),
                ("WebGAL/index.html", b"engine"),
            ],
        );

        let extracted = extract_archive(&archive_path, ArchiveResourceKind::Engine)
            .expect("engine archive should extract");

        assert!(extracted.root_path.join("webgal-engine.json").is_file());
        assert!(extracted.root_path.join("index.html").is_file());
    }

    #[test]
    fn extracts_tar_and_resolves_template_root() {
        let root = tempdir().expect("temp directory should be created");
        let archive_path = root.path().join("template.tar");
        create_tar(
            &archive_path,
            "template/template.json",
            br#"{"name":"Demo"}"#,
        );

        let extracted = extract_archive(&archive_path, ArchiveResourceKind::Template)
            .expect("template archive should extract");

        assert!(extracted.root_path.join("template.json").is_file());
    }

    #[test]
    fn extracts_tar_gz_and_resolves_template_root() {
        let root = tempdir().expect("temp directory should be created");
        let archive_path = root.path().join("template.tar.gz");
        create_tar_gz(
            &archive_path,
            "template/template.json",
            br#"{"name":"Demo"}"#,
        );

        let extracted = extract_archive(&archive_path, ArchiveResourceKind::Template)
            .expect("compressed template archive should extract");

        assert!(extracted.root_path.join("template.json").is_file());
    }

    #[test]
    fn rejects_archives_with_multiple_resource_roots() {
        let root = tempdir().expect("temp directory should be created");
        let archive_path = root.path().join("templates.zip");
        create_zip(
            &archive_path,
            &[
                ("one/template.json", br#"{"name":"One"}"#),
                ("two/template.json", br#"{"name":"Two"}"#),
            ],
        );

        let error = extract_archive(&archive_path, ArchiveResourceKind::Template)
            .expect_err("multiple templates should be rejected");

        assert!(matches!(error, AppError::InvalidArchiveStructure(_)));
    }

    #[test]
    fn rejects_zip_path_traversal() {
        let root = tempdir().expect("temp directory should be created");
        let archive_path = root.path().join("unsafe.zip");
        create_zip(&archive_path, &[("../template.json", b"{}")]);

        let error = extract_archive(&archive_path, ArchiveResourceKind::Template)
            .expect_err("path traversal should be rejected");

        assert!(matches!(error, AppError::UnsafeArchiveEntry(_)));
        assert!(!root.path().join("template.json").exists());
    }

    #[test]
    fn rejects_tar_symbolic_links() {
        let root = tempdir().expect("temp directory should be created");
        let archive_path = root.path().join("unsafe.tar");
        let mut archive =
            tar::Builder::new(File::create(&archive_path).expect("tar file should be created"));
        let mut header = tar::Header::new_gnu();
        header.set_entry_type(tar::EntryType::Symlink);
        header.set_size(0);
        header.set_mode(0o777);
        header
            .set_link_name("../outside")
            .expect("link target should be set");
        header.set_cksum();
        archive
            .append_data(&mut header, "template-link", io::empty())
            .expect("symlink entry should be written");
        archive.finish().expect("tar should finish");

        let error = extract_archive(&archive_path, ArchiveResourceKind::Template)
            .expect_err("symbolic link should be rejected");

        assert!(matches!(error, AppError::UnsafeArchiveEntry(_)));
    }

    #[test]
    fn reports_corrupted_zip_as_invalid_archive() {
        let root = tempdir().expect("temp directory should be created");
        let archive_path = root.path().join("broken.zip");
        fs::write(&archive_path, b"not a zip").expect("fixture should be written");

        let error = extract_archive(&archive_path, ArchiveResourceKind::Engine)
            .expect_err("corrupted zip should be rejected");

        assert!(matches!(error, AppError::InvalidArchive(_)));
    }

    #[test]
    fn rejects_unsupported_archive_extension() {
        let root = tempdir().expect("temp directory should be created");
        let archive_path = root.path().join("template.rar");
        fs::write(&archive_path, b"archive").expect("fixture should be written");

        let error = extract_archive(&archive_path, ArchiveResourceKind::Template)
            .expect_err("unsupported archive should be rejected");

        assert!(matches!(error, AppError::UnsupportedArchive(_)));
    }
}
