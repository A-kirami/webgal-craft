import type { AbsPath } from '~/domain/path'

export interface StaticSiteConfig {
  projectPath: AbsPath
  enginePath?: AbsPath
  templatePath?: AbsPath
}

/** 游戏工程的预览站点：引擎层必填，游戏内容的读取与演出都以它为准 */
export interface PreviewSiteConfig extends StaticSiteConfig {
  enginePath: AbsPath
}
