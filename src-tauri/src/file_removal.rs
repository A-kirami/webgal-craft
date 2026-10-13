//! 用户文件删除的统一入口。
//!
//! 桌面端把文件移入系统回收站，移动端没有回收站只能永久删除。
//! 删除方式必须由调用方显式声明，避免任何一处静默退回永久删除。

use std::{io, path::Path};

/// 删除方式
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RemovalMode {
    /// 移入系统回收站，用户可还原
    Trash,
    /// 永久删除，不可还原
    Permanent,
}

impl RemovalMode {
    /// IPC 契约：`permanent` 缺省为 `false`，即移入回收站
    pub fn from_permanent(permanent: Option<bool>) -> Self {
        if permanent.unwrap_or(false) {
            Self::Permanent
        } else {
            Self::Trash
        }
    }
}

/// 按 `mode` 删除文件或目录
pub fn remove(path: &Path, mode: RemovalMode) -> io::Result<()> {
    match mode {
        RemovalMode::Trash => move_to_trash(path),
        RemovalMode::Permanent => remove_permanently(path),
    }
}

fn remove_permanently(path: &Path) -> io::Result<()> {
    if path.is_dir() {
        std::fs::remove_dir_all(path)
    } else {
        std::fs::remove_file(path)
    }
}

#[cfg(desktop)]
fn move_to_trash(path: &Path) -> io::Result<()> {
    trash::delete(path).map_err(|error| io::Error::other(format!("移动到回收站失败: {error}")))
}

#[cfg(mobile)]
fn move_to_trash(_path: &Path) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "移动端暂不支持将文件移入回收站",
    ))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::{remove, RemovalMode};

    #[test]
    fn removal_mode_defaults_to_trash_when_permanent_is_absent() {
        assert_eq!(RemovalMode::from_permanent(None), RemovalMode::Trash);
        assert_eq!(RemovalMode::from_permanent(Some(false)), RemovalMode::Trash);
        assert_eq!(
            RemovalMode::from_permanent(Some(true)),
            RemovalMode::Permanent
        );
    }

    #[test]
    fn permanent_removal_deletes_files_and_directories() {
        let root = tempdir().expect("temp directory should be created");
        let file = root.path().join("background.png");
        let directory = root.path().join("bgm");
        fs::write(&file, "image").expect("file should be written");
        fs::create_dir(&directory).expect("directory should be created");
        fs::write(directory.join("theme.ogg"), "audio").expect("nested file should be written");

        remove(&file, RemovalMode::Permanent).expect("file should be removed");
        remove(&directory, RemovalMode::Permanent).expect("directory should be removed");

        assert!(!file.exists(), "permanent removal must delete the file");
        assert!(
            !directory.exists(),
            "permanent removal must delete the directory"
        );
    }
}
