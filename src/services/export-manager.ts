import { listen } from '@tauri-apps/api/event'
import sanitize from 'sanitize-filename'

import { exportCmds } from '~/commands/export'
import { AbsPath } from '~/domain/path'
import { gameManager } from '~/services/game-manager'
import { AppError } from '~/types/errors'

import type { PcWindowConfig } from '~/commands/export'
import type { Game } from '~/database/model'

export type { PcWindowConfig } from '~/commands/export'

export interface ExportProgress {
  exportId: string
  percentage: number
  platform: ExportPlatform
  step: string
}

export type PcTargetOs = 'windows' | 'macos' | 'linux'
export type PcTargetArch = 'x64' | 'arm64'
export type PcTarget = 'windows-x64' | 'macos-x64' | 'macos-arm64' | 'linux-x64'
export type ExportPlatform = 'web' | PcTarget

export interface WebExportConfig {
  game: Pick<Game, 'engineId' | 'path'>
  gameName: string
  onProgress?: (progress: ExportProgress) => void
  outputRoot: AbsPath
  replaceExisting?: boolean
}

export interface AndroidWebExportConfig {
  exportSessionId: string
  game: Pick<Game, 'engineId' | 'path'>
  gameName: string
  onProgress?: (progress: ExportProgress) => void
}

export interface PcExportConfig {
  game: Pick<Game, 'engineId' | 'path'>
  gameName: string
  onProgress?: (progress: ExportProgress) => void
  outputRoot: AbsPath
  replaceExisting?: boolean
  runtimePath: AbsPath
  targetArch: PcTargetArch
  targetOs: PcTargetOs
  windowConfig: PcWindowConfig
}

const PC_TARGETS = new Set<PcTarget>(['windows-x64', 'macos-x64', 'macos-arm64', 'linux-x64'])

export function pcTargetKey(targetOs: PcTargetOs, targetArch: PcTargetArch): PcTarget {
  const target = `${targetOs}-${targetArch}`
  if (!PC_TARGETS.has(target as PcTarget)) {
    throw new AppError('INVALID_CONFIG', '不支持的 PC 目标平台或架构')
  }
  return target as PcTarget
}

export function resolvePcExportOutputPath(outputRoot: AbsPath, gameName: string, targetOs: PcTargetOs, targetArch: PcTargetArch): AbsPath | undefined {
  const directoryName = createExportDirectoryName(gameName)
  if (!directoryName) {
    return
  }
  return AbsPath.append(AbsPath.append(outputRoot, directoryName), pcTargetKey(targetOs, targetArch))
}

function createExportDirectoryName(gameName: string): string {
  const trimmed = gameName.trim()
  if (trimmed === '.' || trimmed === '..') {
    return ''
  }

  return sanitize(trimmed, { replacement: '_' })
}

export function resolveWebExportOutputPath(outputRoot: AbsPath, gameName: string): AbsPath | undefined {
  const directoryName = createExportDirectoryName(gameName)
  if (!directoryName) {
    return
  }

  const gameOutputRoot = AbsPath.append(outputRoot, directoryName)
  return AbsPath.append(gameOutputRoot, 'web')
}

async function exportWeb(config: WebExportConfig): Promise<AbsPath> {
  const gameName = config.gameName.trim()
  const outputPath = resolveWebExportOutputPath(config.outputRoot, gameName)
  if (!gameName || !outputPath) {
    throw new AppError('INVALID_CONFIG', '游戏名称不能生成有效的导出目录')
  }

  const site = await gameManager.resolvePreviewSite(config.game)
  if (!site.enginePath) {
    throw new AppError('ENGINE_EDITOR_INCOMPATIBLE', '当前游戏没有可用的导出引擎')
  }

  const exportId = crypto.randomUUID()
  const unlisten = await listen<ExportProgress>('export-progress', (event) => {
    const progress = event.payload
    if (progress.exportId !== exportId || progress.platform !== 'web') {
      return
    }

    config.onProgress?.({
      ...progress,
      percentage: Math.min(100, Math.max(0, progress.percentage)),
    })
  })

  try {
    await exportCmds.exportWeb({
      enginePath: site.enginePath,
      exportId,
      gameName,
      gamePath: site.projectPath,
      outputPath,
      replaceExisting: config.replaceExisting ?? false,
      templatePath: site.templatePath,
    })
    return outputPath
  } finally {
    unlisten()
  }
}

async function exportAndroidWebZip(config: AndroidWebExportConfig): Promise<void> {
  const gameName = config.gameName.trim()
  if (!gameName || !createExportDirectoryName(gameName)) {
    throw new AppError('INVALID_CONFIG', '游戏名称不能生成有效的导出文件名')
  }

  const site = await gameManager.resolvePreviewSite(config.game)
  if (!site.enginePath) {
    throw new AppError('ENGINE_EDITOR_INCOMPATIBLE', '当前游戏没有可用的导出引擎')
  }

  const exportId = crypto.randomUUID()
  const unlisten = await listen<ExportProgress>('export-progress', (event) => {
    const progress = event.payload
    if (progress.exportId === exportId && progress.platform === 'web') {
      config.onProgress?.({
        ...progress,
        percentage: Math.min(100, Math.max(0, progress.percentage)),
      })
    }
  })

  try {
    await exportCmds.exportAndroidWebZip({
      enginePath: site.enginePath,
      exportId,
      exportSessionId: config.exportSessionId,
      gameName,
      gamePath: site.projectPath,
      templatePath: site.templatePath,
    })
  } finally {
    unlisten()
  }
}

async function exportPc(config: PcExportConfig): Promise<AbsPath> {
  const gameName = config.gameName.trim()
  const directoryName = createExportDirectoryName(gameName)
  if (!gameName || !directoryName) {
    throw new AppError('INVALID_CONFIG', '游戏名称不能生成有效的导出目录')
  }
  const outputPath = resolvePcExportOutputPath(config.outputRoot, gameName, config.targetOs, config.targetArch)!
  const site = await gameManager.resolvePreviewSite(config.game)
  if (!site.enginePath) {
    throw new AppError('ENGINE_EDITOR_INCOMPATIBLE', '当前游戏没有可用的导出引擎')
  }
  const exportId = crypto.randomUUID()
  const unlisten = await listen<ExportProgress>('export-progress', (event) => {
    const progress = event.payload
    if (progress.exportId !== exportId || progress.platform !== pcTargetKey(config.targetOs, config.targetArch)) {
      return
    }
    config.onProgress?.({ ...progress, percentage: Math.min(100, Math.max(0, progress.percentage)) })
  })
  try {
    await exportCmds.exportPc({
      enginePath: site.enginePath,
      exportId,
      gameName,
      gamePath: site.projectPath,
      outputPath,
      replaceExisting: config.replaceExisting ?? false,
      runtimePath: config.runtimePath,
      targetArch: config.targetArch,
      targetOs: config.targetOs,
      templatePath: site.templatePath,
      windowConfig: config.windowConfig,
    })
    return outputPath
  } finally {
    unlisten()
  }
}

async function ensurePcRuntime(targetOs: PcTargetOs, targetArch: PcTargetArch, proxyPrefix?: string): Promise<AbsPath> {
  return exportCmds.ensurePcRuntime({ proxyPrefix, targetArch, targetOs })
}

export const exportManager = {
  exportAndroidWebZip,
  exportPc,
  exportWeb,
  ensurePcRuntime,
}
