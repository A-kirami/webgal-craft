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

export interface AndroidWebExportParams {
  enginePath: AbsPath
  exportId: string
  exportSessionId: string
  gameName: string
  gamePath: AbsPath
  templatePath?: AbsPath
}

function exportWeb(params: WebExportParams): Promise<void> {
  return safeInvoke('export_web', { ...params })
}

function exportAndroidWebZip(params: AndroidWebExportParams): Promise<void> {
  return safeInvoke('export_android_web_zip', { ...params })
}

function cleanupAndroidWebExport(exportSessionId: string): Promise<void> {
  return safeInvoke('cleanup_android_web_export', { exportSessionId })
}

export const exportCmds = {
  cleanupAndroidWebExport,
  exportAndroidWebZip,
  exportWeb,
}
