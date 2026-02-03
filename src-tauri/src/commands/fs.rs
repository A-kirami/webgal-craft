use std::{fs, io, path::Path};

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
