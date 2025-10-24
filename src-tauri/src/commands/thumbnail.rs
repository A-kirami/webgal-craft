use std::{fs, io::Read, path::PathBuf};

use blake3::Hasher;
use image::{self, GenericImageView};
use serde::{Deserialize, Serialize};
use tauri::{command, ipc::Response, AppHandle, Manager};
use webp;

use super::{AppError, AppResult};

#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ThumbnailSize {
    Single(u32),
    Custom { width: u32, height: u32 },
}

impl Default for ThumbnailSize {
    fn default() -> Self {
        Self::Single(256)
    }
}

// 辅助函数：计算路径的哈希值
fn hash_path(path: &str) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    std::hash::Hash::hash(&path, &mut hasher);
    format!("{:x}", std::hash::Hasher::finish(&hasher))
}

fn get_cache_path(app_handle: &AppHandle, original_path: &str, size: &ThumbnailSize) -> PathBuf {
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .expect("Failed to get app cache directory")
        .join("thumbnails");

    // 确保缓存目录存在
    fs::create_dir_all(&cache_dir).expect("Failed to create cache directory");

    // 获取尺寸信息
    let (width, height) = match size {
        ThumbnailSize::Single(s) => (*s, *s),
        ThumbnailSize::Custom {
            width,
            height,
        } => (*width, *height),
    };

    // 使用 blake3 计算文件哈希
    let content_hash = match fs::File::open(original_path) {
        Ok(mut file) => {
            let mut hasher = Hasher::new();
            let mut buffer = [0u8; 8192]; // 8KB 缓冲区
            loop {
                match file.read(&mut buffer) {
                    Ok(0) => break, // 文件结束
                    Ok(n) => {
                        hasher.update(&buffer[..n]);
                    }
                    Err(_) => {
                        // 如果读取失败，回退到使用路径哈希
                        return cache_dir.join(format!(
                            "{}_{}x{}.thumb",
                            hash_path(original_path),
                            width,
                            height
                        ));
                    }
                }
            }
            hasher.finalize().to_hex().to_string()
        }
        Err(_) => {
            // 如果无法打开文件，使用路径哈希
            hash_path(original_path)
        }
    };

    cache_dir.join(format!("{}_{}x{}.thumb", content_hash, width, height))
}

#[command]
pub async fn get_thumbnail(
    app_handle: AppHandle,
    path: String,
    size: Option<ThumbnailSize>,
) -> AppResult<Response> {
    let size = size.unwrap_or_default();
    let size = match size {
        ThumbnailSize::Single(s) => ThumbnailSize::Custom {
            width: s,
            height: s,
        },
        ThumbnailSize::Custom {
            width,
            height,
        } => ThumbnailSize::Custom {
            width,
            height,
        },
    };

    let cache_path = get_cache_path(&app_handle, &path, &size);

    // 检查缓存是否存在且有效
    if cache_path.exists() {
        if let Ok(cached_data) = fs::read(&cache_path) {
            return Ok(Response::new(cached_data));
        }
    }

    // 如果缓存不存在或无效，生成新的缩略图
    let img = match image::open(&path) {
        Ok(img) => img,
        Err(e) => {
            // 如果是 ICO 文件，尝试特殊处理
            if path.to_lowercase().ends_with(".ico") {
                match fs::read(&path) {
                    Ok(data) => match image::load_from_memory(&data) {
                        Ok(img) => img,
                        Err(_) => return Err(AppError::Image(format!("无法打开ICO图片: {}", e))),
                    },
                    Err(e) => return Err(AppError::Io(e)),
                }
            } else {
                return Err(AppError::Image(format!("无法打开图片: {}", e)));
            }
        }
    };

    // 计算保持宽高比的尺寸
    let (width, height) = img.dimensions();
    let aspect_ratio = width as f32 / height as f32;

    let (new_width, new_height) = match size {
        ThumbnailSize::Custom {
            width,
            height,
        } => {
            if aspect_ratio > 1.0 {
                // 宽图
                let new_width = width;
                let new_height = (width as f32 / aspect_ratio) as u32;
                (new_width, new_height)
            } else {
                // 高图
                let new_height = height;
                let new_width = (height as f32 * aspect_ratio) as u32;
                (new_width, new_height)
            }
        }
        _ => unreachable!(),
    };

    // 使用更快的缩放算法
    let thumbnail = if new_width > 512 || new_height > 512 {
        // 对于大尺寸缩略图，使用两步缩放
        let intermediate_width = (new_width as f32 * 0.5) as u32;
        let intermediate_height = (new_height as f32 * 0.5) as u32;
        let intermediate = img.resize(
            intermediate_width,
            intermediate_height,
            image::imageops::FilterType::Triangle,
        );
        intermediate.resize(new_width, new_height, image::imageops::FilterType::Triangle)
    } else {
        // 对于小尺寸缩略图，直接使用Triangle算法
        img.resize(new_width, new_height, image::imageops::FilterType::Triangle)
    };

    // 使用 webp crate 进行编码
    let img_rgba = thumbnail.to_rgba8();
    let (width, height) = img_rgba.dimensions();
    let encoder = webp::Encoder::new(&img_rgba, webp::PixelLayout::Rgba, width, height);
    let buffer = encoder.encode(80.0).to_vec();

    // 保存到缓存
    if let Err(e) = fs::write(&cache_path, &buffer) {
        eprintln!("写入缓存失败: {}", e);
    }

    Ok(Response::new(buffer))
}

// 清理缓存命令
#[command]
pub async fn clear_thumbnail_cache(app_handle: AppHandle) -> AppResult<()> {
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .expect("无法获取应用缓存目录")
        .join("thumbnails");

    if cache_dir.exists() {
        fs::remove_dir_all(&cache_dir)?;
        fs::create_dir_all(&cache_dir)?;
    }
    Ok(())
}
