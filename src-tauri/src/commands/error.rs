use std::io;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error(transparent)]
    Io(#[from] io::Error),

    #[error("图片处理错误: {0}")]
    Image(String),

    #[error("服务器错误: {0}")]
    Server(String),

    #[error("配置错误: {0}")]
    Config(String),

    #[error(transparent)]
    Tauri(#[from] tauri::Error),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

pub type AppResult<T> = Result<T, AppError>;
