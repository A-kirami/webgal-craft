import type { StaticSiteConfig } from '~/types/server'

export interface DiscoveredResource {
  path: string
  name: string
  icon?: string
  previewSite?: StaticSiteConfig
  /** 引擎分组键，仅 type=engines 设置 */
  engineId?: string
  /** 引擎版本号，仅 type=engines 设置 */
  version?: string
}
