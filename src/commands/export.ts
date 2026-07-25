import { safeInvoke } from '~/utils/invoke'

import type { AbsPath } from '~/domain/path'

export interface WebExportParams {
  enginePath: AbsPath
  exportId: string
  gameName: string
  gamePath: AbsPath
  outputPath: AbsPath
  replaceExisting: boolean
  templatePath?: AbsPath
}

function exportWeb(params: WebExportParams): Promise<void> {
  return safeInvoke('export_web', { ...params })
}

export const exportCmds = {
  exportWeb,
}
