import { safeInvoke } from '~/utils/invoke'

import type { ProjectConfig } from '~/types/project-config'

function readProjectConfig(projectPath: string): Promise<ProjectConfig> {
  return safeInvoke('read_project_config_cmd', { projectPath })
}

function writeProjectConfig(projectPath: string, config: ProjectConfig): Promise<void> {
  return safeInvoke('write_project_config_cmd', { projectPath, config })
}

export const projectConfigCmds = {
  readProjectConfig,
  writeProjectConfig,
}
