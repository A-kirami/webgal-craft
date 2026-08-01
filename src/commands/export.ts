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

export interface PublishedAndroidExport {
  contentUri: string
  displayPath: string
  kind: 'published'
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

function cleanupRecoverableAndroidWebExports(): Promise<void> {
  return safeInvoke('android_export_cleanup_recoverable')
}

function publishAndroidWebExport(
  exportSessionId: string,
  suggestedFileName: string,
): Promise<PublishedAndroidExport> {
  return safeInvoke('android_export_publish', { exportSessionId, suggestedFileName })
}

function openPublishedAndroidWebExport(contentUri: string): Promise<void> {
  return safeInvoke('android_export_open', { contentUri })
}

function sharePublishedAndroidWebExport(contentUri: string): Promise<void> {
  return safeInvoke('android_export_share', { contentUri })
}

export const exportCmds = {
  cleanupAndroidWebExport,
  cleanupRecoverableAndroidWebExports,
  exportAndroidWebZip,
  exportWeb,
  openPublishedAndroidWebExport,
  publishAndroidWebExport,
  sharePublishedAndroidWebExport,
}
