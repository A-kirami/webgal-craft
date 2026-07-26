use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
};

use super::{AppError, AppResult};
use serde::{Deserialize, Serialize};

fn ensure_field_has_no_line_breaks(field_name: &str, value: &str) -> AppResult<()> {
    if value.contains('\n') || value.contains('\r') {
        return Err(AppError::Config(format!(
            "游戏配置字段不能包含换行: {field_name}"
        )));
    }

    Ok(())
}

fn ensure_field_has_no_semicolons(field_name: &str, value: &str) -> AppResult<()> {
    if value.contains(';') {
        return Err(AppError::Config(format!(
            "游戏配置字段不能包含分号: {field_name}"
        )));
    }

    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ParsedConfigLine {
    key: String,
    value: String,
    trailing_suffix: String,
}

fn parse_config_line(line: &str) -> Option<ParsedConfigLine> {
    let line = line.trim();
    if is_comment_line(line) {
        return None;
    }

    let (content_prefix, trailing_suffix) = split_content_prefix_and_trailing_suffix(line);
    let (key, value) = content_prefix.split_once(":")?;
    let key = key.trim();
    if key.is_empty() {
        return None;
    }

    Some(ParsedConfigLine {
        key: key.to_string(),
        value: value.trim().to_string(),
        trailing_suffix: trailing_suffix.to_string(),
    })
}

fn is_comment_line(line: &str) -> bool {
    let line = line.trim();
    line.starts_with(';')
}

fn split_content_prefix_and_trailing_suffix(line: &str) -> (&str, &str) {
    match line.find(';') {
        Some(index) => (&line[..index], &line[index..]),
        None => (line, ""),
    }
}

fn looks_like_config_line(line: &str) -> bool {
    let line = line.trim();
    !line.is_empty() && !is_comment_line(line) && (line.contains(':') || line.ends_with(';'))
}

fn format_config_line(key: &str, value: &str, trailing_suffix: &str) -> String {
    if trailing_suffix.is_empty() {
        return format!("{key}: {value};");
    }

    format!("{key}: {value}{trailing_suffix}")
}

fn collect_last_line_indices_by(content: &str) -> HashMap<String, usize> {
    let mut last_indices = HashMap::new();

    for (line_index, line) in content.lines().enumerate() {
        let Some(parsed_line) = parse_config_line(line) else {
            continue;
        };

        last_indices.insert(parsed_line.key, line_index);
    }

    last_indices
}

fn normalize_entry_key(key: &str) -> AppResult<String> {
    ensure_field_has_no_line_breaks("configKey", key)?;

    let normalized_key = key.trim();
    if normalized_key.is_empty() {
        return Err(AppError::Config("配置键不能为空".to_string()));
    }

    if normalized_key.contains(':') {
        return Err(AppError::Config(format!(
            "配置键不能包含冒号: {normalized_key}"
        )));
    }

    if normalized_key.contains(';') {
        return Err(AppError::Config(format!(
            "配置键不能包含分号: {normalized_key}"
        )));
    }

    Ok(normalized_key.to_string())
}

fn normalize_entries(entries: Vec<GameConfigEntry>) -> AppResult<Vec<GameConfigEntry>> {
    let mut normalized_entries = Vec::with_capacity(entries.len());
    let mut seen_keys = HashSet::new();

    for entry in entries {
        let key = normalize_entry_key(&entry.key)?;
        ensure_field_has_no_line_breaks(&key, &entry.value)?;
        ensure_field_has_no_semicolons(&key, &entry.value)?;

        if !seen_keys.insert(key.clone()) {
            return Err(AppError::Config(format!("配置键重复: {key}")));
        }

        normalized_entries.push(GameConfigEntry {
            key,
            value: entry.value,
        });
    }

    Ok(normalized_entries)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameConfigEntry {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameConfigReadResult {
    #[serde(default)]
    pub entries: Vec<GameConfigEntry>,
    pub unmanaged_line_count: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameConfigWritePayload {
    #[serde(default)]
    pub entries: Vec<GameConfigEntry>,
}

#[tauri::command]
pub fn get_game_config(game_path: String) -> AppResult<GameConfigReadResult> {
    read_game_config(Path::new(&game_path))
}

pub(crate) fn read_game_config(game_path: &Path) -> AppResult<GameConfigReadResult> {
    // 构建配置文件路径
    let config_path = game_path.join("game").join("config.txt");

    // 读取配置文件内容
    let content = fs::read_to_string(&config_path)?;

    let mut entry_values = HashMap::new();
    let mut entry_positions = HashMap::new();
    let mut unmanaged_line_count = 0;

    for (line_index, line) in content.lines().enumerate() {
        let trimmed_line = line.trim();
        if trimmed_line.is_empty() || is_comment_line(trimmed_line) {
            continue;
        }

        let Some(parsed_line) = parse_config_line(line) else {
            if looks_like_config_line(trimmed_line) {
                unmanaged_line_count += 1;
            }
            continue;
        };

        entry_positions.insert(parsed_line.key.clone(), line_index);
        entry_values.insert(parsed_line.key, parsed_line.value);
    }

    let mut entries = entry_positions
        .into_iter()
        .map(|(key, line_index)| {
            (
                line_index,
                GameConfigEntry {
                    value: entry_values
                        .remove(&key)
                        .expect("config value should exist for collected key"),
                    key,
                },
            )
        })
        .collect::<Vec<_>>();
    entries.sort_by_key(|(line_index, _)| *line_index);

    Ok(GameConfigReadResult {
        entries: entries.into_iter().map(|(_, entry)| entry).collect(),
        unmanaged_line_count,
    })
}

#[tauri::command]
pub fn set_game_config(game_path: String, config: GameConfigWritePayload) -> AppResult<()> {
    // 构建配置文件路径
    let config_path = Path::new(&game_path).join("game").join("config.txt");

    // 读取配置文件内容
    let content = fs::read_to_string(&config_path)?;

    let normalized_entries = normalize_entries(config.entries)?;
    let existing_line_indices = collect_last_line_indices_by(&content);
    let next_entry_value_map = normalized_entries
        .iter()
        .map(|entry| (entry.key.clone(), entry.value.clone()))
        .collect::<HashMap<_, _>>();
    let entry_order = normalized_entries
        .iter()
        .map(|entry| entry.key.clone())
        .collect::<Vec<_>>();
    let mut written_keys = HashSet::new();

    let mut updated_lines = Vec::new();

    for (line_index, line) in content.lines().enumerate() {
        let Some(parsed_line) = parse_config_line(line) else {
            updated_lines.push(line.to_string());
            continue;
        };

        let Some(last_line_index) = existing_line_indices.get(&parsed_line.key) else {
            updated_lines.push(line.to_string());
            continue;
        };

        let Some(next_value) = next_entry_value_map.get(&parsed_line.key) else {
            continue;
        };

        if *last_line_index != line_index {
            continue;
        }

        updated_lines.push(format_config_line(
            &parsed_line.key,
            next_value,
            &parsed_line.trailing_suffix,
        ));
        written_keys.insert(parsed_line.key);
    }

    for key in entry_order {
        if written_keys.contains(&key) {
            continue;
        }

        let value = next_entry_value_map
            .get(&key)
            .expect("config value should exist for ordered key");
        updated_lines.push(format!("{}: {};", key, value));
    }

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
    use super::{
        get_game_config, set_game_config, AppError, GameConfigEntry, GameConfigWritePayload,
    };
    use std::{
        fs,
        path::PathBuf,
        sync::atomic::{AtomicU64, Ordering},
        time::{SystemTime, UNIX_EPOCH},
    };

    static TEMP_GAME_DIR_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn create_temp_game_dir() -> PathBuf {
        let unique_suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();
        let counter = TEMP_GAME_DIR_COUNTER.fetch_add(1, Ordering::Relaxed);
        let game_dir = std::env::temp_dir().join(format!(
            "webgal-craft-game-config-{unique_suffix}-{counter}"
        ));
        fs::create_dir_all(game_dir.join("game")).expect("temp game directory should be created");
        game_dir
    }

    fn entry(key: &str, value: &str) -> GameConfigEntry {
        GameConfigEntry {
            key: key.to_string(),
            value: value.to_string(),
        }
    }

    #[test]
    fn get_game_config_returns_raw_entries_and_counts_unmanaged_lines() {
        let game_dir = create_temp_game_dir();
        let config_path = game_dir.join("game").join("config.txt");
        fs::write(
            &config_path,
            "Game_name: Demo;\nCustom_flag: old;\nBroken_line missing;semicolon;\nCustom_flag: new;\n; comment\nStage_Width: 1280;\n",
        )
        .expect("config should be written");

        let config =
            get_game_config(game_dir.to_string_lossy().into_owned()).expect("config should parse");

        assert_eq!(
            config.entries,
            vec![
                GameConfigEntry {
                    key: "Game_name".to_string(),
                    value: "Demo".to_string(),
                },
                GameConfigEntry {
                    key: "Custom_flag".to_string(),
                    value: "new".to_string(),
                },
                GameConfigEntry {
                    key: "Stage_Width".to_string(),
                    value: "1280".to_string(),
                }
            ]
        );
        assert_eq!(config.unmanaged_line_count, 1);

        fs::remove_dir_all(game_dir).expect("temp game directory should be removed");
    }

    #[test]
    fn get_game_config_parses_lines_without_trailing_semicolons_and_discards_inline_tail() {
        let game_dir = create_temp_game_dir();
        let config_path = game_dir.join("game").join("config.txt");
        fs::write(
            &config_path,
            "Game_name: Demo\nDescription: Intro story; official sample\nCustom_flag: enabled;tail;comment\n",
        )
        .expect("config should be written");

        let config =
            get_game_config(game_dir.to_string_lossy().into_owned()).expect("config should parse");

        assert_eq!(
            config.entries,
            vec![
                GameConfigEntry {
                    key: "Game_name".to_string(),
                    value: "Demo".to_string(),
                },
                GameConfigEntry {
                    key: "Description".to_string(),
                    value: "Intro story".to_string(),
                },
                GameConfigEntry {
                    key: "Custom_flag".to_string(),
                    value: "enabled".to_string(),
                }
            ]
        );
        assert_eq!(config.unmanaged_line_count, 0);

        fs::remove_dir_all(game_dir).expect("temp game directory should be removed");
    }

    #[test]
    fn get_game_config_ignores_semicolon_comments_even_if_they_look_like_entries() {
        let game_dir = create_temp_game_dir();
        let config_path = game_dir.join("game").join("config.txt");
        fs::write(
            &config_path,
            "; note: keep this;\nGame_name: Demo;\nCustom_flag: enabled;\n",
        )
        .expect("config should be written");

        let config =
            get_game_config(game_dir.to_string_lossy().into_owned()).expect("config should parse");

        assert_eq!(
            config.entries,
            vec![
                GameConfigEntry {
                    key: "Game_name".to_string(),
                    value: "Demo".to_string(),
                },
                GameConfigEntry {
                    key: "Custom_flag".to_string(),
                    value: "enabled".to_string(),
                }
            ]
        );
        assert_eq!(config.unmanaged_line_count, 0);

        fs::remove_dir_all(game_dir).expect("temp game directory should be removed");
    }

    #[test]
    fn set_game_config_rewrites_entries_in_raw_key_space_and_preserves_unmanaged_lines() {
        let game_dir = create_temp_game_dir();
        let config_path = game_dir.join("game").join("config.txt");
        fs::write(
            &config_path,
            "; heading\nGame_name: Demo;\nCustom_keep: old;\nCustom_remove: stale;\nCustom_remove: stale-2;\nBroken_line missing;semicolon;\n",
        )
        .expect("config should be written");

        let payload = GameConfigWritePayload {
            entries: vec![
                entry("Game_name", "Renamed"),
                entry("Custom_keep", "updated"),
                entry("Stage_Width", "1280"),
                entry("New_key", "fresh"),
            ],
        };

        set_game_config(game_dir.to_string_lossy().into_owned(), payload)
            .expect("config should update");

        let content = fs::read_to_string(&config_path).expect("updated config should be readable");
        assert_eq!(
            content,
            "; heading\nGame_name: Renamed;\nCustom_keep: updated;\nBroken_line missing;semicolon;\nStage_Width: 1280;\nNew_key: fresh;\n"
        );

        fs::remove_dir_all(game_dir).expect("temp game directory should be removed");
    }

    #[test]
    fn set_game_config_preserves_inline_tail_and_normalizes_missing_trailing_semicolons() {
        let game_dir = create_temp_game_dir();
        let config_path = game_dir.join("game").join("config.txt");
        fs::write(
            &config_path,
            "Game_name: Demo\nDescription: Intro story; official sample\nCustom_flag: enabled\n",
        )
        .expect("config should be written");

        let payload = GameConfigWritePayload {
            entries: vec![
                entry("Game_name", "Renamed"),
                entry("Description", "Updated story"),
                entry("Custom_flag", "disabled"),
            ],
        };

        set_game_config(game_dir.to_string_lossy().into_owned(), payload)
            .expect("config should update");

        let content = fs::read_to_string(&config_path).expect("updated config should be readable");
        assert_eq!(
            content,
            "Game_name: Renamed;\nDescription: Updated story; official sample\nCustom_flag: disabled;\n"
        );

        fs::remove_dir_all(game_dir).expect("temp game directory should be removed");
    }

    #[test]
    fn set_game_config_preserves_semicolon_comments_that_contain_colons() {
        let game_dir = create_temp_game_dir();
        let config_path = game_dir.join("game").join("config.txt");
        fs::write(
            &config_path,
            "; note: keep this;\nGame_name: Demo;\nCustom_keep: old;\n",
        )
        .expect("config should be written");

        let payload = GameConfigWritePayload {
            entries: vec![
                entry("Game_name", "Renamed"),
                entry("Custom_keep", "updated"),
            ],
        };

        set_game_config(game_dir.to_string_lossy().into_owned(), payload)
            .expect("config should update");

        let content = fs::read_to_string(&config_path).expect("updated config should be readable");
        assert_eq!(
            content,
            "; note: keep this;\nGame_name: Renamed;\nCustom_keep: updated;\n"
        );

        fs::remove_dir_all(game_dir).expect("temp game directory should be removed");
    }

    #[test]
    fn set_game_config_rejects_keys_and_values_with_semicolons() {
        let game_dir = create_temp_game_dir();
        let config_path = game_dir.join("game").join("config.txt");
        fs::write(&config_path, "Game_name: Demo;\n").expect("config should be written");

        let key_error = set_game_config(
            game_dir.to_string_lossy().into_owned(),
            GameConfigWritePayload {
                entries: vec![entry("Bad;Key", "value")],
            },
        )
        .expect_err("semicolon keys should be rejected");

        assert!(matches!(
            key_error,
            AppError::Config(message) if message.contains("Bad;Key")
        ));

        let value_error = set_game_config(
            game_dir.to_string_lossy().into_owned(),
            GameConfigWritePayload {
                entries: vec![entry("Game_name", "Demo;Broken")],
            },
        )
        .expect_err("semicolon values should be rejected");

        assert!(matches!(
            value_error,
            AppError::Config(message) if message.contains("Game_name")
        ));

        fs::remove_dir_all(game_dir).expect("temp game directory should be removed");
    }

    #[test]
    fn set_game_config_rejects_duplicate_keys() {
        let game_dir = create_temp_game_dir();
        let config_path = game_dir.join("game").join("config.txt");
        fs::write(&config_path, "Game_name: Demo;\n").expect("config should be written");
        let payload = GameConfigWritePayload {
            entries: vec![entry("Game_name", "Demo"), entry("Game_name", "Renamed")],
        };

        let error = set_game_config(game_dir.to_string_lossy().into_owned(), payload)
            .expect_err("duplicate keys should be rejected");

        assert!(matches!(
            error,
            AppError::Config(message) if message.contains("Game_name")
        ));

        fs::remove_dir_all(game_dir).expect("temp game directory should be removed");
    }

    #[test]
    fn set_game_config_rejects_blank_and_invalid_keys() {
        let game_dir = create_temp_game_dir();
        let config_path = game_dir.join("game").join("config.txt");
        fs::write(&config_path, "Game_name: Demo;\n").expect("config should be written");

        let payload = GameConfigWritePayload {
            entries: vec![entry("Invalid:key", "value")],
        };

        let error = set_game_config(game_dir.to_string_lossy().into_owned(), payload)
            .expect_err("invalid keys should be rejected");

        assert!(matches!(
            error,
            AppError::Config(message) if message.contains("Invalid:key")
        ));

        fs::remove_dir_all(game_dir).expect("temp game directory should be removed");
    }

    #[test]
    fn set_game_config_rejects_multiline_values() {
        let game_dir = create_temp_game_dir();
        let config_path = game_dir.join("game").join("config.txt");
        fs::write(&config_path, "Game_name: Demo;\nDescription: Story;\n")
            .expect("config should be written");

        let payload = GameConfigWritePayload {
            entries: vec![entry("Description", "Line 1\nLine 2")],
        };

        let error = set_game_config(game_dir.to_string_lossy().into_owned(), payload)
            .expect_err("multiline values should be rejected");

        assert!(matches!(
            error,
            AppError::Config(message) if message.contains("Description")
        ));

        fs::remove_dir_all(game_dir).expect("temp game directory should be removed");
    }
}
