use std::{collections::HashMap, fs, path::Path};

use regex::Regex;

use super::{AppError, AppResult};

/// 将蛇形命名转换为小驼峰命名
fn snake_to_camel(s: &str) -> String {
    let mut result = String::new();
    let mut capitalize_next = false;

    for c in s.chars() {
        if c == '_' {
            capitalize_next = true;
        } else {
            result.push(match capitalize_next {
                true => {
                    capitalize_next = false;
                    c.to_ascii_uppercase()
                }
                false => c.to_ascii_lowercase(),
            });
        }
    }
    result
}

/// 将小驼峰命名转换为蛇形命名
fn camel_to_snake(s: &str) -> String {
    let mut result = String::new();

    for (i, c) in s.chars().enumerate() {
        if c.is_uppercase() && i > 0 {
            result.push('_');
        }
        result.push(c.to_ascii_lowercase());
    }
    result
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
                let key = key.trim().to_string();
                let value = value.trim().to_string();
                // 转换为小驼峰命名
                config_map.insert(snake_to_camel(&key), value);
            }
        }
    }

    Ok(config_map)
}

#[tauri::command]
pub fn set_game_config(game_path: String, config: HashMap<String, String>) -> AppResult<()> {
    // 构建配置文件路径
    let config_path = Path::new(&game_path).join("game").join("config.txt");

    // 读取配置文件内容
    let content = fs::read_to_string(&config_path)?;

    // 使用正则表达式更新配置项
    let mut updated_content = content.clone();
    for (key, value) in config.iter() {
        // 将小驼峰转换为蛇形命名
        let snake_key = camel_to_snake(key);
        // 构建正则表达式，匹配键及其值（不区分大小写）
        let pattern = format!(r"(?i)({}):[^;]*;", regex::escape(&snake_key));
        let replacement = format!("$1: {};", value);

        // 编译正则表达式
        let re =
            Regex::new(&pattern).map_err(|e| AppError::Config(format!("正则表达式错误: {}", e)))?;

        // 如果配置项已存在，则替换；否则添加到文件末尾
        if re.is_match(&updated_content) {
            updated_content = re.replace_all(&updated_content, replacement).to_string();
        } else {
            // 确保在添加新配置前有一个换行符
            if !updated_content.is_empty() && !updated_content.ends_with('\n') {
                updated_content.push('\n');
            }
            updated_content.push_str(&format!("{}: {};", snake_key, value));
        }
    }

    // 写入更新后的内容
    fs::write(&config_path, updated_content)?;

    Ok(())
}
