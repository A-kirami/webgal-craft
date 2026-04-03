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

    #[error("窗口错误: {0}")]
    Window(String),

    #[error(transparent)]
    Tauri(#[from] tauri::Error),
}

impl AppError {
    /// 稳定的错误分类码，前端据此做程序化判断
    fn code(&self) -> &'static str {
        match self {
            Self::Io(_) => "IO_ERROR",
            Self::Image(_) => "IMAGE_ERROR",
            Self::Server(_) => "SERVER_ERROR",
            Self::Config(_) => "CONFIG_ERROR",
            Self::Window(_) => "WINDOW_ERROR",
            Self::Tauri(_) => "TAURI_ERROR",
        }
    }
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("code", self.code())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use std::io;

    use serde_json::json;

    use super::AppError;

    #[test]
    fn app_error_code_matches_frontend_contract() {
        assert_eq!(AppError::Io(io::Error::other("disk")).code(), "IO_ERROR");
        assert_eq!(AppError::Image("image".into()).code(), "IMAGE_ERROR");
        assert_eq!(AppError::Server("server".into()).code(), "SERVER_ERROR");
        assert_eq!(AppError::Config("config".into()).code(), "CONFIG_ERROR");
        assert_eq!(AppError::Window("window".into()).code(), "WINDOW_ERROR");
    }

    #[test]
    fn app_error_serialization_exposes_stable_code_and_message() {
        let serialized = serde_json::to_value(AppError::Config("缺少配置".into()))
            .expect("config error should serialize");

        assert_eq!(
            serialized,
            json!({
                "code": "CONFIG_ERROR",
                "message": "配置错误: 缺少配置",
            })
        );
    }
}
