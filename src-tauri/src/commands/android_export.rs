use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

use serde_json::{json, Value};
use tauri::{AppHandle, Runtime};
use zip::{write::SimpleFileOptions, ZipWriter};

use super::{
    export::{
        cleanup_export_work_directory, emit_web_export_progress, export_error,
        export_web_to_directory, STEP_FINISHED,
    },
    AppError, AppResult,
};

const STEP_COMPRESSING: &str = "export.progress.compressing";

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
    validate_export_session_id(&export_session_id)?;
    let session_directory =
        crate::mobile::android_export::resolve_staging(&app, &export_session_id)
            .await
            .map_err(export_error)?;
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
                    emit_web_export_progress(&app, &export_id, step, percentage)
                },
            )?;
            zip_directory(&web_directory, &session_directory.join("export.zip"))?;
            emit_web_export_progress(&app, &export_id, STEP_FINISHED, 100)
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
    validate_export_session_id(&export_session_id)?;
    crate::mobile::android_export::cleanup_staging(&app, &export_session_id)
        .await
        .map_err(export_error)
}

#[tauri::command]
pub async fn android_export_publish<R: Runtime>(
    app: AppHandle<R>,
    export_session_id: String,
    suggested_file_name: String,
) -> Result<Value, Value> {
    crate::mobile::android_export::invoke(
        &app,
        "publishWebExport",
        json!({
            "exportSessionId": export_session_id,
            "suggestedFileName": suggested_file_name,
        }),
    )
    .await
}

#[tauri::command]
pub async fn android_export_open<R: Runtime>(
    app: AppHandle<R>,
    content_uri: String,
) -> Result<Value, Value> {
    crate::mobile::android_export::invoke(
        &app,
        "openPublishedExport",
        json!({ "contentUri": content_uri }),
    )
    .await
}

#[tauri::command]
pub async fn android_export_share<R: Runtime>(
    app: AppHandle<R>,
    content_uri: String,
) -> Result<Value, Value> {
    crate::mobile::android_export::invoke(
        &app,
        "sharePublishedExport",
        json!({ "contentUri": content_uri }),
    )
    .await
}

#[tauri::command]
pub async fn android_export_cleanup_recoverable<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Value, Value> {
    crate::mobile::android_export::invoke(&app, "cleanupRecoverableWebExports", json!({})).await
}

#[cfg(test)]
mod tests {
    use std::{fs, io::Read};

    #[cfg(unix)]
    use std::path::Path;

    use tempfile::tempdir;
    use zip::ZipArchive;

    #[cfg(unix)]
    use super::{collect_zip_entries, AppError};
    use super::{validate_export_session_id, zip_directory};

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
