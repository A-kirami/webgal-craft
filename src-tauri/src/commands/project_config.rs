use std::path::Path;

use crate::vfs::{read_project_config, write_project_config, ProjectConfig};

use super::AppResult;

#[tauri::command]
pub fn read_project_config_cmd(project_path: String) -> AppResult<ProjectConfig> {
    read_project_config(Path::new(&project_path))
}

#[tauri::command]
pub async fn write_project_config_cmd(
    project_path: String,
    config: ProjectConfig,
) -> AppResult<()> {
    write_project_config(Path::new(&project_path), &config).await
}
