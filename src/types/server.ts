import type { AbsPath } from '~/domain/path'

export interface StaticSiteConfig {
  projectPath: AbsPath
  enginePath?: AbsPath
  templatePath?: AbsPath
}
