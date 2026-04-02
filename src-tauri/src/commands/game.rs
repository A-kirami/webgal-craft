use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
};

use super::{AppError, AppResult};
use serde::Deserialize;

#[derive(Clone, Copy)]
struct GameConfigKeyMapping {
    raw_key: &'static str,
    frontend_key: &'static str,
}

const GAME_CONFIG_KEY_MAPPINGS: [GameConfigKeyMapping; 16] = [
    GameConfigKeyMapping {
        raw_key: "Game_name",
        frontend_key: "gameName",
    },
    GameConfigKeyMapping {
        raw_key: "Game_key",
        frontend_key: "gameKey",
    },
    GameConfigKeyMapping {
        raw_key: "Title_img",
        frontend_key: "titleImg",
    },
    GameConfigKeyMapping {
        raw_key: "Title_bgm",
        frontend_key: "titleBgm",
    },
    GameConfigKeyMapping {
        raw_key: "Game_Logo",
        frontend_key: "gameLogo",
    },
    GameConfigKeyMapping {
        raw_key: "Enable_Appreciation",
        frontend_key: "enableAppreciation",
    },
    GameConfigKeyMapping {
        raw_key: "Legacy_Expression_Blend_Mode",
        frontend_key: "legacyExpressionBlendMode",
    },
    GameConfigKeyMapping {
        raw_key: "Steam_AppID",
        frontend_key: "steamAppId",
    },
    GameConfigKeyMapping {
        raw_key: "Default_Language",
        frontend_key: "defaultLanguage",
    },
    GameConfigKeyMapping {
        raw_key: "Show_panic",
        frontend_key: "showPanic",
    },
    GameConfigKeyMapping {
        raw_key: "Max_line",
        frontend_key: "maxLine",
    },
    GameConfigKeyMapping {
        raw_key: "Line_height",
        frontend_key: "lineHeight",
    },
    GameConfigKeyMapping {
        raw_key: "Stage_Width",
        frontend_key: "stageWidth",
    },
    GameConfigKeyMapping {
        raw_key: "Stage_Height",
        frontend_key: "stageHeight",
    },
    GameConfigKeyMapping {
        raw_key: "Description",
        frontend_key: "description",
    },
    GameConfigKeyMapping {
        raw_key: "Package_name",
        frontend_key: "packageName",
    },
];

fn map_raw_key_to_frontend_key(raw_key: &str) -> Option<&'static str> {
    GAME_CONFIG_KEY_MAPPINGS
        .iter()
        .find(|mapping| mapping.raw_key == raw_key)
        .map(|mapping| mapping.frontend_key)
}

fn map_frontend_key_to_raw_key(frontend_key: &str) -> Option<&'static str> {
    GAME_CONFIG_KEY_MAPPINGS
        .iter()
        .find(|mapping| mapping.frontend_key == frontend_key)
        .map(|mapping| mapping.raw_key)
}

fn require_raw_key(frontend_key: &str) -> AppResult<&'static str> {
    map_frontend_key_to_raw_key(frontend_key)
        .ok_or_else(|| AppError::Config(format!("不支持的游戏配置字段: {frontend_key}")))
}

fn ensure_single_line_value(frontend_key: &str, value: &str) -> AppResult<()> {
    if value.contains('\n') || value.contains('\r') {
        return Err(AppError::Config(format!(
            "游戏配置字段不能包含换行: {frontend_key}"
        )));
    }

    Ok(())
}

/// 解析配置行中的键名
fn parse_config_line_key(line: &str) -> Option<String> {
    let line = line.trim();
    let line = line.strip_suffix(";")?;
    let (key, _) = line.split_once(":")?;
    Some(key.trim().to_string())
}

#[derive(Debug, Deserialize)]
pub struct GameConfigPatch {
    #[serde(default)]
    pub set: HashMap<String, String>,
    #[serde(default)]
    pub unset: Vec<String>,
}

#[tauri::command]
pub fn get_game_config(game_path: String) -> AppResult<HashMap<String, String>> {
    // 构建配置文件路径
    let config_path = Path::new(&game_path).join("game").join("config.txt");

    // 读取配置文件内容
    let content = fs::read_to_string(&config_path)?;

    // 解析配置项
    let mut config_map = HashMap::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || !line.ends_with(";") {
            continue;
        }

        if let Some(line) = line.strip_suffix(";") {
            if let Some((key, value)) = line.split_once(":") {
                let key = key.trim();
                let value = value.trim().to_string();
                let Some(frontend_key) = map_raw_key_to_frontend_key(key) else {
                    continue;
                };

                config_map.insert(frontend_key.to_string(), value);
            }
        }
    }

    Ok(config_map)
}

#[tauri::command]
pub fn set_game_config(game_path: String, config: GameConfigPatch) -> AppResult<()> {
    // 构建配置文件路径
    let config_path = Path::new(&game_path).join("game").join("config.txt");

    // 读取配置文件内容
    let content = fs::read_to_string(&config_path)?;

    // 同键同时出现在 unset 和 set 时，非空 set 视为最终值；空字符串 set 仍视为显式 unset
    let mut pending_removals = HashSet::new();
    for key in config.unset {
        pending_removals.insert(require_raw_key(&key)?.to_string());
    }
    let mut pending_updates = HashMap::new();

    for (key, value) in config.set {
        // config.txt 只接受已知原始键名，且每个值都必须保持单行
        ensure_single_line_value(&key, &value)?;
        let raw_key = require_raw_key(&key)?.to_string();

        if value.is_empty() {
            pending_removals.insert(raw_key);
            continue;
        }

        pending_updates.insert(raw_key, value);
    }

    let mut updated_lines = Vec::new();

    for line in content.lines() {
        let Some(existing_key) = parse_config_line_key(line) else {
            updated_lines.push(line.to_string());
            continue;
        };

        if let Some(next_value) = pending_updates.remove(&existing_key) {
            updated_lines.push(format!("{}: {};", existing_key, next_value));
            continue;
        }

        if pending_removals.contains(&existing_key) {
            continue;
        }

        updated_lines.push(line.to_string());
    }

    let mut appended_lines = pending_updates
        .into_iter()
        .map(|(key, value)| format!("{}: {};", key, value))
        .collect::<Vec<_>>();
    appended_lines.sort_unstable();
    updated_lines.extend(appended_lines);

    let mut updated_content = updated_lines.join("\n");
    if content.ends_with('\n') && !updated_content.is_empty() {
        updated_content.push('\n');
    }

    // 写入更新后的内容
    fs::write(&config_path, updated_content)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{get_game_config, set_game_config, AppError, GameConfigPatch};
    use std::{
        collections::HashMap,
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn create_temp_game_dir() -> PathBuf {
        let unique_suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();
        let game_dir =
            std::env::temp_dir().join(format!("webgal-craft-game-config-{unique_suffix}"));
        fs::create_dir_all(game_dir.join("game")).expect("temp game directory should be created");
        game_dir
    }

    #[test]
    fn get_game_config_maps_known_raw_keys_to_frontend_keys() {
        let game_dir = create_temp_game_dir();
        let config_path = game_dir.join("game").join("config.txt");
        fs::write(
            &config_path,
            "Game_name: Demo;\nDefault_Language: zh_CN;\nSteam_AppID: 123456;\nGame_Logo: logo1|logo2;\nStage_Width: 1280;\nStage_Height: 720;\nUnexpected_key: keep-hidden;\n",
        )
        .expect("config should be written");

        let config =
            get_game_config(game_dir.to_string_lossy().into_owned()).expect("config should parse");

        assert_eq!(config.get("gameName"), Some(&"Demo".to_string()));
        assert_eq!(config.get("defaultLanguage"), Some(&"zh_CN".to_string()));
        assert_eq!(config.get("steamAppId"), Some(&"123456".to_string()));
        assert_eq!(config.get("gameLogo"), Some(&"logo1|logo2".to_string()));
        assert_eq!(config.get("stageWidth"), Some(&"1280".to_string()));
        assert_eq!(config.get("stageHeight"), Some(&"720".to_string()));
        assert!(!config.contains_key("Unexpected_key"));

        fs::remove_dir_all(game_dir).expect("temp game directory should be removed");
    }

    #[test]
    fn set_game_config_updates_existing_values_with_explicit_raw_keys() {
        let game_dir = create_temp_game_dir();
        let config_path = game_dir.join("game").join("config.txt");
        fs::write(
            &config_path,
            "Game_name: Demo;\nMax_line: 3;\nLine_height: 2.2;\nShow_panic: true;\n",
        )
        .expect("config should be written");

        let mut set = HashMap::new();
        set.insert("gameName".to_string(), "Renamed Demo".to_string());
        set.insert("defaultLanguage".to_string(), "ja".to_string());
        set.insert("steamAppId".to_string(), "999".to_string());
        let patch = GameConfigPatch {
            set,
            unset: vec!["maxLine".to_string()],
        };

        set_game_config(game_dir.to_string_lossy().into_owned(), patch)
            .expect("config should update");

        let content = fs::read_to_string(&config_path).expect("updated config should be readable");
        assert!(content.contains("Game_name: Renamed Demo;"));
        assert!(content.contains("Default_Language: ja;"));
        assert!(content.contains("Line_height: 2.2;"));
        assert!(content.contains("Show_panic: true;"));
        assert!(content.contains("Steam_AppID: 999;"));
        assert!(!content.contains("Max_line:"));

        fs::remove_dir_all(game_dir).expect("temp game directory should be removed");
    }

    #[test]
    fn set_game_config_removes_empty_non_toggle_values_and_keeps_toggle_values() {
        let game_dir = create_temp_game_dir();
        let config_path = game_dir.join("game").join("config.txt");
        fs::write(
            &config_path,
            "Game_name: Demo;\nDescription: Story;\nGame_Logo: opening.webp|enter.webp|;\nDefault_Language: zh_CN;\nSteam_AppID: 123456;\nEnable_Appreciation: true;\nLegacy_Expression_Blend_Mode: false;\nShow_panic: true;\n",
        )
        .expect("config should be written");

        let mut set = HashMap::new();
        set.insert("gameName".to_string(), "".to_string());
        set.insert("description".to_string(), "".to_string());
        set.insert("gameLogo".to_string(), "".to_string());
        set.insert("defaultLanguage".to_string(), "".to_string());
        set.insert("steamAppId".to_string(), "".to_string());
        set.insert("enableAppreciation".to_string(), "false".to_string());
        set.insert("legacyExpressionBlendMode".to_string(), "true".to_string());
        set.insert("showPanic".to_string(), "false".to_string());
        let patch = GameConfigPatch { set, unset: vec![] };

        set_game_config(game_dir.to_string_lossy().into_owned(), patch)
            .expect("config should update");

        let content = fs::read_to_string(&config_path).expect("updated config should be readable");
        assert!(!content.contains("Game_name:"));
        assert!(!content.contains("Description:"));
        assert!(!content.contains("Game_Logo:"));
        assert!(!content.contains("Default_Language:"));
        assert!(!content.contains("Steam_AppID:"));
        assert!(content.contains("Enable_Appreciation: false;"));
        assert!(content.contains("Legacy_Expression_Blend_Mode: true;"));
        assert!(content.contains("Show_panic: false;"));

        fs::remove_dir_all(game_dir).expect("temp game directory should be removed");
    }

    #[test]
    fn set_game_config_rejects_unknown_frontend_keys() {
        let game_dir = create_temp_game_dir();
        let config_path = game_dir.join("game").join("config.txt");
        fs::write(&config_path, "Game_name: Demo;\n").expect("config should be written");

        let mut set = HashMap::new();
        set.insert("unsupportedKey".to_string(), "value".to_string());
        let patch = GameConfigPatch { set, unset: vec![] };

        let error = set_game_config(game_dir.to_string_lossy().into_owned(), patch)
            .expect_err("unknown frontend key should be rejected");

        assert!(matches!(
            error,
            AppError::Config(message) if message.contains("unsupportedKey")
        ));

        fs::remove_dir_all(game_dir).expect("temp game directory should be removed");
    }

    #[test]
    fn set_game_config_rejects_multiline_values() {
        let game_dir = create_temp_game_dir();
        let config_path = game_dir.join("game").join("config.txt");
        fs::write(&config_path, "Game_name: Demo;\nDescription: Story;\n")
            .expect("config should be written");

        let mut set = HashMap::new();
        set.insert("description".to_string(), "Line 1\nLine 2".to_string());
        let patch = GameConfigPatch { set, unset: vec![] };

        let error = set_game_config(game_dir.to_string_lossy().into_owned(), patch)
            .expect_err("multiline values should be rejected");

        assert!(matches!(
            error,
            AppError::Config(message) if message.contains("description")
        ));

        fs::remove_dir_all(game_dir).expect("temp game directory should be removed");
    }
}
