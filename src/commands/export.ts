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

export interface PcWindowConfig {
  width: number
  height: number
  minWidth: number
  minHeight: number
  fullScreen: boolean
  resizable: boolean
}

export interface PcExportParams {
  enginePath: AbsPath
  exportId: string
  gameName: string
  gamePath: AbsPath
  outputPath: AbsPath
  replaceExisting: boolean
  runtimePath: AbsPath
  targetArch: 'x64' | 'arm64'
  targetOs: 'windows' | 'macos' | 'linux'
  templatePath?: AbsPath
  windowConfig: PcWindowConfig
}

export interface EnsurePcRuntimeParams {
  targetArch: 'x64' | 'arm64'
  targetOs: 'windows' | 'macos' | 'linux'
  proxyPrefix?: string
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

function exportPc(params: PcExportParams): Promise<void> {
  return safeInvoke('export_pc', { ...params })
}

function ensurePcRuntime(params: EnsurePcRuntimeParams): Promise<AbsPath> {
  return safeInvoke('ensure_pc_runtime', { ...params })
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
  ensurePcRuntime,
  exportAndroidWebZip,
  exportPc,
  exportWeb,
  openPublishedAndroidWebExport,
  publishAndroidWebExport,
  sharePublishedAndroidWebExport,
}
