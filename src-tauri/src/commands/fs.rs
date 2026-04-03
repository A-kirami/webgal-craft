use std::{fs, io, path::Path};

/// 检测文件是否为二进制文件
/// 读取前 8192 字节，若包含 null byte 则判定为二进制
const BINARY_CHECK_BUFFER_SIZE: usize = 8192;

use tauri::ipc::Channel;

use super::{AppError, AppResult};

// 定义复制事件枚举
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
pub enum CopyEvent {
    Progress {
        progress: u32,
        copied_files: usize,
        total_files: usize,
    },
    Error {
        error: String,
    },
}

pub fn count_files(path: String) -> AppResult<usize> {
    let path = Path::new(&path);
    let mut count = 0;
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        if ty.is_dir() {
            count += count_files(entry.path().to_string_lossy().to_string())?;
        } else {
            count += 1;
        }
    }
    Ok(count)
}

/// 用于跟踪复制进度的结构体
struct ProgressTracker {
    sender: Channel<CopyEvent>,
    total_files: usize,
    copied_files: usize,
    last_progress: u32,
}

/// 递归复制文件夹
fn copy_dir_all(
    src: &Path,
    dst: &Path,
    progress_tracker: &mut Option<&mut ProgressTracker>,
) -> io::Result<()> {
    if !dst.exists() {
        fs::create_dir_all(dst)?;
    }

    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if ty.is_dir() {
            copy_dir_all(&src_path, &dst_path, progress_tracker)?;
        } else {
            fs::copy(&src_path, &dst_path)?;

            // 更新进度
            if let Some(tracker) = progress_tracker {
                tracker.copied_files += 1;
                let progress =
                    (tracker.copied_files as f64 / tracker.total_files as f64 * 100.0) as u32;
                // 只有当进度变化超过1%时才发送
                if progress - tracker.last_progress >= 1 {
                    let _ = tracker.sender.send(CopyEvent::Progress {
                        progress,
                        copied_files: tracker.copied_files,
                        total_files: tracker.total_files,
                    });
                    tracker.last_progress = progress;
                }
            }
        }
    }

    Ok(())
}

/// 带进度的目录复制
#[tauri::command]
pub async fn copy_directory_with_progress(
    source: String,
    destination: String,
    on_event: Channel<CopyEvent>,
) -> AppResult<()> {
    let source_path = Path::new(&source);
    let destination_path = Path::new(&destination);

    if !source_path.exists() {
        return Err(AppError::Server(format!("源目录不存在: {}", source)));
    }

    if !source_path.is_dir() {
        return Err(AppError::Server(format!("源路径不是目录: {}", source)));
    }

    // 计算总文件数
    let total_files = count_files(source.clone())?;

    // 创建进度跟踪器
    let mut progress_tracker = ProgressTracker {
        sender: on_event,
        total_files,
        copied_files: 0,
        last_progress: 0,
    };

    // 复制目录
    if let Err(e) = copy_dir_all(
        source_path,
        destination_path,
        &mut Some(&mut progress_tracker),
    ) {
        progress_tracker
            .sender
            .send(CopyEvent::Error {
                error: format!("复制失败: {}", e),
            })
            .map_err(|e| AppError::Server(format!("发送错误事件失败: {}", e)))?;
        return Err(AppError::Server(format!("复制失败: {}", e)));
    }

    Ok(())
}

#[tauri::command]
pub async fn copy_directory(source: String, destination: String) -> AppResult<()> {
    let source_path = Path::new(&source);
    let destination_path = Path::new(&destination);

    if !source_path.exists() {
        return Err(AppError::Server(format!("源目录不存在: {}", source)));
    }

    if !source_path.is_dir() {
        return Err(AppError::Server(format!("源路径不是目录: {}", source)));
    }

    // 创建目标目录
    if !destination_path.exists() {
        fs::create_dir_all(destination_path)?;
    }

    // 递归复制目录
    copy_dir_all(source_path, destination_path, &mut None)?;

    Ok(())
}

#[tauri::command]
pub fn validate_directory_structure(
    path: String,
    required_dirs: Vec<String>,
    required_files: Vec<String>,
) -> AppResult<bool> {
    let path = Path::new(&path);

    // 如果路径是文件，直接返回 false
    if path.is_file() {
        return Ok(false);
    }

    // 检查必要的文件夹
    for dir in required_dirs.iter() {
        if !path.join(dir).exists() || !path.join(dir).is_dir() {
            return Ok(false);
        }
    }

    // 检查必要的文件
    for file in required_files.iter() {
        if !path.join(file).exists() || !path.join(file).is_file() {
            return Ok(false);
        }
    }

    // 所有检查都通过
    Ok(true)
}

/// 检测文件是否为二进制文件
/// 读取前 8192 字节，包含 null byte 则判定为二进制；空文件视为文本
#[tauri::command]
pub async fn is_binary_file(path: String) -> AppResult<bool> {
    use std::io::Read;
    let mut file = fs::File::open(&path)?;
    let mut buffer = vec![0u8; BINARY_CHECK_BUFFER_SIZE];
    let bytes_read = file.read(&mut buffer)?;
    Ok(buffer[..bytes_read].contains(&0))
}

fn read_image_dimensions(path: &str) -> AppResult<(u32, u32)> {
    image::image_dimensions(path)
        .map_err(|error| AppError::Image(format!("无法读取图片尺寸: {error}")))
}

/// 仅读取图片头部元数据获取分辨率，不解码完整像素数据
#[tauri::command]
pub async fn get_image_dimensions(path: String) -> AppResult<(u32, u32)> {
    read_image_dimensions(&path)
}

/// 删除文件或文件夹
/// 默认移动到回收站，如果 permanent 为 true 则直接删除
#[tauri::command]
pub async fn delete_file(path: String, permanent: Option<bool>) -> AppResult<()> {
    let path = Path::new(&path);

    if !path.exists() {
        return Err(AppError::Server(format!("路径不存在: {}", path.display())));
    }

    let should_permanent_delete = permanent.unwrap_or(false);

    if should_permanent_delete {
        // 直接删除
        if path.is_dir() {
            fs::remove_dir_all(path)?;
        } else {
            fs::remove_file(path)?;
        }
    } else {
        // 移动到回收站
        trash::delete(path).map_err(|e| AppError::Server(format!("移动到回收站失败: {}", e)))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{count_files, is_binary_file, read_image_dimensions, validate_directory_structure};

    const PNG_1X1_BYTES: &[u8] = &[
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6,
        0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 15, 4, 0, 9,
        251, 3, 253, 167, 137, 129, 153, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
    ];

    fn create_temp_image_path() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("webgal-craft-image-size-{unique}.png"))
    }

    fn create_temp_dir(prefix: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("{prefix}-{unique}"));
        fs::create_dir_all(&dir).expect("temp directory should be created");
        dir
    }

    #[test]
    fn read_image_dimensions_reads_png_header_without_full_decode() {
        let image_path = create_temp_image_path();
        fs::write(&image_path, PNG_1X1_BYTES).expect("should create temporary png");

        let dimensions = read_image_dimensions(image_path.to_string_lossy().as_ref())
            .expect("should read image size from file header");

        let _ = fs::remove_file(&image_path);

        assert_eq!(dimensions, (1, 1));
    }

    #[test]
    fn count_files_counts_nested_files_recursively() {
        let root = create_temp_dir("webgal-craft-count-files");
        let nested = root.join("nested").join("scene");
        fs::create_dir_all(&nested).expect("nested directory should be created");
        fs::write(root.join("game.txt"), "demo").expect("root file should be created");
        fs::write(root.join("nested").join("bgm.ogg"), "bgm")
            .expect("nested file should be created");
        fs::write(nested.join("script.txt"), "script").expect("deep file should be created");

        let file_count = count_files(root.to_string_lossy().into_owned())
            .expect("file count should include nested files");

        fs::remove_dir_all(&root).expect("temp directory should be removed");

        assert_eq!(file_count, 3);
    }

    #[test]
    fn validate_directory_structure_checks_required_files_and_directories() {
        let root = create_temp_dir("webgal-craft-validate-structure");
        fs::create_dir_all(root.join("game")).expect("game directory should be created");
        fs::create_dir_all(root.join("assets")).expect("assets directory should be created");
        fs::write(root.join("game").join("config.txt"), "Game_name: Demo;\n")
            .expect("config file should be created");

        let valid = validate_directory_structure(
            root.to_string_lossy().into_owned(),
            vec!["game".into(), "assets".into()],
            vec!["game/config.txt".into()],
        )
        .expect("structure validation should succeed");
        let invalid = validate_directory_structure(
            root.to_string_lossy().into_owned(),
            vec!["game".into(), "missing".into()],
            vec!["game/config.txt".into()],
        )
        .expect("structure validation should succeed");

        fs::remove_dir_all(&root).expect("temp directory should be removed");

        assert!(valid);
        assert!(!invalid);
    }

    #[test]
    fn is_binary_file_detects_null_bytes_but_allows_plain_text() {
        let root = create_temp_dir("webgal-craft-binary-file");
        let text_path = root.join("script.txt");
        let binary_path = root.join("archive.bin");
        fs::write(&text_path, "show bg forest").expect("text file should be created");
        fs::write(&binary_path, [0x57, 0x47, 0x00, 0x43]).expect("binary file should be created");

        let runtime = tokio::runtime::Builder::new_current_thread()
            .build()
            .expect("runtime should be created");
        let text_is_binary = runtime
            .block_on(is_binary_file(text_path.to_string_lossy().into_owned()))
            .expect("text detection should succeed");
        let binary_is_binary = runtime
            .block_on(is_binary_file(binary_path.to_string_lossy().into_owned()))
            .expect("binary detection should succeed");

        fs::remove_dir_all(&root).expect("temp directory should be removed");

        assert!(!text_is_binary);
        assert!(binary_is_binary);
    }
}
