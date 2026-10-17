use std::{fs, path::Path};

use serde::Serialize;

use super::{AppError, AppResult};

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAssetFile {
    pub asset_type: String,
    pub relative_path: String,
}

/// 一次遍历返回扁平资源清单，避免前端按目录逐个 read_dir 造成 N 次 IPC。
#[tauri::command]
pub async fn scan_game_assets(game_path: String) -> AppResult<Vec<GameAssetFile>> {
    tauri::async_runtime::spawn_blocking(move || scan_game_assets_blocking(Path::new(&game_path)))
        .await
        .map_err(|error| AppError::Server(format!("资源清单扫描任务执行失败: {error}")))?
}

fn scan_game_assets_blocking(game_path: &Path) -> AppResult<Vec<GameAssetFile>> {
    let mut files = Vec::new();

    for entry in fs::read_dir(game_path.join("game"))? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }

        let Ok(asset_type) = entry.file_name().into_string() else {
            continue;
        };
        collect_asset_files(&entry.path(), &asset_type, Path::new(""), &mut files)?;
    }

    files.sort_unstable_by(|left, right| {
        left.asset_type
            .cmp(&right.asset_type)
            .then_with(|| left.relative_path.cmp(&right.relative_path))
    });

    Ok(files)
}

fn collect_asset_files(
    directory: &Path,
    asset_type: &str,
    relative_directory: &Path,
    files: &mut Vec<GameAssetFile>,
) -> AppResult<()> {
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let relative_path = relative_directory.join(entry.file_name());

        if entry.file_type()?.is_dir() {
            collect_asset_files(&entry.path(), asset_type, &relative_path, files)?;
            continue;
        }

        let Some(relative_path) = relative_path.to_str() else {
            continue;
        };
        files.push(GameAssetFile {
            asset_type: asset_type.to_string(),
            relative_path: relative_path.replace('\\', "/"),
        });
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::{scan_game_assets_blocking, AppError, GameAssetFile};

    #[test]
    fn scan_collects_nested_files_in_stable_order_and_ignores_top_level_files() {
        let root = tempdir().expect("temp directory should be created");
        let game = root.path().join("game");
        fs::create_dir_all(game.join("background").join("chapter"))
            .expect("background directories should be created");
        fs::create_dir_all(game.join("figure")).expect("figure directory should be created");
        fs::create_dir_all(game.join("animation")).expect("animation directory should be created");
        fs::write(game.join("config.txt"), "").expect("config file should be written");
        fs::write(game.join("background").join("day.png"), "")
            .expect("background file should be written");
        fs::write(
            game.join("background").join("chapter").join("night.png"),
            "",
        )
        .expect("nested background file should be written");
        fs::write(game.join("figure").join("hero.png"), "").expect("figure file should be written");
        fs::write(game.join("animation").join("animationTable.json"), "")
            .expect("animation table should be written");

        let files = scan_game_assets_blocking(root.path()).expect("scan should succeed");

        assert_eq!(
            files,
            vec![
                GameAssetFile {
                    asset_type: "animation".to_string(),
                    relative_path: "animationTable.json".to_string(),
                },
                GameAssetFile {
                    asset_type: "background".to_string(),
                    relative_path: "chapter/night.png".to_string(),
                },
                GameAssetFile {
                    asset_type: "background".to_string(),
                    relative_path: "day.png".to_string(),
                },
                GameAssetFile {
                    asset_type: "figure".to_string(),
                    relative_path: "hero.png".to_string(),
                },
            ]
        );
    }

    #[test]
    fn scan_returns_empty_list_when_game_has_no_asset_files() {
        let root = tempdir().expect("temp directory should be created");
        fs::create_dir_all(root.path().join("game")).expect("game directory should be created");

        let files = scan_game_assets_blocking(root.path()).expect("scan should succeed");

        assert!(files.is_empty());
    }

    #[test]
    fn scan_reports_missing_game_directory() {
        let root = tempdir().expect("temp directory should be created");

        let error = scan_game_assets_blocking(root.path()).expect_err("scan should fail");

        assert!(matches!(error, AppError::Io(_)));
    }
}
