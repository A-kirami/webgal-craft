use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io;

pub const CONFIG_FILE: &str = "webgal-runtime.json";
pub const RESOURCE_DIRECTORY: &str = "resources";

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GameConfig {
    pub game_key: String,
    pub title: String,
    pub width: u32,
    pub height: u32,
    pub min_width: u32,
    pub min_height: u32,
    pub full_screen: bool,
    pub resizable: bool,
}

impl GameConfig {
    pub fn validate(&self) -> io::Result<()> {
        if self.game_key.trim().is_empty()
            || self.min_width == 0
            || self.min_height == 0
            || self.width < self.min_width
            || self.height < self.min_height
        {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "invalid game identity or window size",
            ));
        }
        Ok(())
    }
    pub fn storage_id(&self) -> String {
        Sha256::digest(self.game_key.as_bytes())
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect()
    }

    pub fn application_id(&self) -> String {
        format!("com.webgalcraft.game.{}", self.storage_id())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(key: &str, title: &str) -> GameConfig {
        GameConfig {
            game_key: key.into(),
            title: title.into(),
            width: 1280,
            height: 720,
            min_width: 800,
            min_height: 600,
            full_screen: false,
            resizable: true,
        }
    }

    #[test]
    fn storage_identity_does_not_depend_on_display_name() {
        let original = config("demo-key", "Original");
        let renamed = config("demo-key", "Renamed");
        assert_eq!(original.application_id(), renamed.application_id());
        assert_eq!(original.storage_id().len(), 64);
        assert_ne!(
            original.application_id(),
            config("other-key", "Original").application_id()
        );
    }

    #[test]
    fn rejects_invalid_runtime_configuration() {
        let mut game = config(" ", "Game");
        assert_eq!(
            game.validate().unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
        game.game_key = "valid".into();
        game.min_width = game.width + 1;
        assert!(game.validate().is_err());
    }
}
