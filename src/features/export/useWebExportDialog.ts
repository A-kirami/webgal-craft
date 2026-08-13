import { openPath } from '@tauri-apps/plugin-opener'
import { arch, platform } from '@tauri-apps/plugin-os'

import { AbsPath } from '~/domain/path'
import { createAndroidWebExportWorkflow } from '~/features/export/android-web-export-workflow'
import { desktopDirectoryPicker } from '~/features/resource-import/desktop-directory-picker'
import {
  exportManager,
  resolvePcExportOutputPath,
  resolveWebExportOutputPath,
} from '~/services/export-manager'
import { fromExternalAbsPath } from '~/services/platform/path-boundary'
import { isAndroidRuntime } from '~/services/platform/runtime'
import { useGeneralSettingsStore } from '~/stores/general-settings'
import { AppError } from '~/types/errors'
import { handleError } from '~/utils/error-handler'

import { useExportElapsedTimer } from './useExportElapsedTimer'

import type { Game } from '~/database/model'
import type { ExportPlatform, ExportProgress, PcTarget, PcTargetArch, PcTargetOs, PcWindowConfig } from '~/services/export-manager'

export type WebExportStatus = 'idle' | 'running' | 'completed' | 'failed'
export type ExportType = 'web' | 'desktop'

interface UseWebExportDialogOptions {
  android?: boolean
  confirmOverwrite: (outputPath: AbsPath) => Promise<boolean>
  defaultOutputRoot: MaybeRefOrGetter<string>
  game: MaybeRefOrGetter<Game>
  open: Ref<boolean | undefined>
  t: (key: string, values?: Record<string, unknown>) => string
}

export interface ExportTask {
  elapsedMs?: number
  outputPath?: AbsPath
  platform: ExportPlatform
  progress: number
  status: WebExportStatus
  stepKey: string
}

const DEFAULT_WINDOW_CONFIG: PcWindowConfig = {
  fullScreen: false,
  height: 760,
  minHeight: 600,
  minWidth: 800,
  resizable: true,
  width: 1280,
}

function currentDevicePcTarget(): PcTarget[] {
  switch (platform()) {
    case 'windows': {
      return ['windows-x64']
    }
    case 'linux': {
      return ['linux-x64']
    }
    case 'macos': {
      if (arch() === 'x86_64') {
        return ['macos-x64']
      }
      if (arch() === 'aarch64') {
        return ['macos-arm64']
      }
      return []
    }
    default: {
      return []
    }
  }
}

export function useWebExportDialog(options: UseWebExportDialogOptions) {
  const android = options.android ?? isAndroidRuntime()
  const generalSettingsStore = useGeneralSettingsStore()
  const androidWorkflow = createAndroidWebExportWorkflow()
  const currentGame = computed(() => toValue(options.game))
  const gameName = computed(() => currentGame.value.metadata.name)
  const selectedDesktopTargets = ref<PcTarget[]>(currentDevicePcTarget())
  const windowConfig = ref<PcWindowConfig>({ ...DEFAULT_WINDOW_CONFIG })
  const exportTasks = ref<ExportTask[]>([])
  const { elapsedMs, reset: resetElapsedTimer, start: startElapsedTimer, stop: stopElapsedTimer } = useExportElapsedTimer()

  const outputRoot = shallowRef<AbsPath>()
  const publishedExport = shallowRef<{ contentUri: string, displayPath: string }>()
  const pendingOverwriteConfirmations = shallowRef(0)
  const isSelectingDirectory = shallowRef(false)
  const isStartingExport = shallowRef(false)

  const isRunning = computed(() => exportTasks.value.some(task => task.status === 'running'))
  const isBusy = computed(() => pendingOverwriteConfirmations.value > 0 || isSelectingDirectory.value || isStartingExport.value || isRunning.value)
  const outputPreview = computed(() => {
    if (android) {
      return publishedExport.value?.displayPath ?? options.t('export.androidDestination')
    }
    return outputRoot.value && resolveWebExportOutputPath(outputRoot.value, gameName.value)
  })
  const hasOutputTarget = computed(() => android || outputPreview.value !== undefined)
  const canStart = computed(() => !isBusy.value && hasOutputTarget.value)
  const hasDesktopTargets = computed(() => selectedDesktopTargets.value.length > 0)
  const desktopOutputPreview = computed(() => {
    const target = selectedDesktopTargets.value[0]
    if (!outputRoot.value || !target) {
      return
    }
    const [targetOs, targetArch] = parsePcTarget(target)
    const outputPath = resolvePcExportOutputPath(outputRoot.value, gameName.value, targetOs, targetArch)
    return outputPath && AbsPath.parent(outputPath)
  })

  function configuredOutputRoot(): AbsPath | undefined {
    if (android) {
      return
    }
    const configuredPath = toValue(options.defaultOutputRoot).trim()
    if (!configuredPath) {
      return
    }
    try {
      return fromExternalAbsPath(configuredPath)
    } catch (error) {
      logger.warn(`忽略无效的默认导出目录: ${error}`)
    }
  }

  function reset(): void {
    resetElapsedTimer()
    outputRoot.value = configuredOutputRoot()
    selectedDesktopTargets.value = currentDevicePcTarget()
    publishedExport.value = undefined
    exportTasks.value = []
    pendingOverwriteConfirmations.value = 0
    isSelectingDirectory.value = false
    isStartingExport.value = false
  }

  watch(options.open, (isOpen) => {
    if (isOpen) {
      reset()
    }
  }, { immediate: true })

  watch(() => toValue(options.defaultOutputRoot), () => {
    if (options.open.value && !outputRoot.value) {
      outputRoot.value = configuredOutputRoot()
    }
  })

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen && isBusy.value) {
      return
    }
    options.open.value = nextOpen
  }

  async function selectOutputRoot(): Promise<void> {
    if (android || isBusy.value) {
      return
    }
    isSelectingDirectory.value = true
    try {
      const selected = await desktopDirectoryPicker.selectDirectory(options.t('export.selectDirectory'), outputRoot.value)
      if (selected) {
        outputRoot.value = selected
      }
    } catch (error) {
      logger.error(`选择导出目录失败: ${error}`)
      toast.error(options.t('export.selectDirectoryFailed'))
    } finally {
      isSelectingDirectory.value = false
    }
  }

  function createTask(platform: ExportProgress['platform']): ExportTask {
    return { platform, progress: 0, status: 'idle', stepKey: 'export.progress.ready' }
  }

  function selectedPlatforms(selectedPlatform: ExportType | undefined): ExportPlatform[] {
    if (selectedPlatform === 'web') {
      return ['web']
    }
    if (selectedPlatform === 'desktop') {
      return selectedDesktopTargets.value
    }
    return []
  }

  function prepareExportTasks(selectedPlatform: ExportType | undefined): void {
    const platforms = selectedPlatforms(selectedPlatform)
    exportTasks.value = android
      ? (selectedPlatform === 'web' ? [createTask('web')] : [])
      : platforms.map(platform => createTask(platform))
  }

  function updateTask(platform: ExportProgress['platform'], update: Partial<ExportTask>): void {
    const task = exportTasks.value.find(item => item.platform === platform)
    if (task) {
      Object.assign(task, update)
    }
  }

  async function runtimePath(targetOs: PcTargetOs, targetArch: PcTargetArch): Promise<AbsPath> {
    return exportManager.ensurePcRuntime(targetOs, targetArch, generalSettingsStore.officialEngineDownloadProxy)
  }

  function desktopOutputPath(root: AbsPath, name: string, targetOs: PcTargetOs, targetArch: PcTargetArch): AbsPath {
    return resolvePcExportOutputPath(root, name, targetOs, targetArch)!
  }

  function parsePcTarget(target: PcTarget): [PcTargetOs, PcTargetArch] {
    switch (target) {
      case 'windows-x64': {
        return ['windows', 'x64']
      }
      case 'macos-x64': {
        return ['macos', 'x64']
      }
      case 'macos-arm64': {
        return ['macos', 'arm64']
      }
      case 'linux-x64': {
        return ['linux', 'x64']
      }
      default: {
        const exhaustiveTarget: never = target
        throw new Error(`不支持的 PC 目标平台: ${exhaustiveTarget}`)
      }
    }
  }

  async function startExport(selectedPlatform: ExportType | undefined): Promise<void> {
    if (!canStart.value || (!android && !outputRoot.value)) {
      return
    }
    if (android && selectedPlatform !== 'web') {
      return
    }
    const selectedGame = currentGame.value
    const selectedGameName = gameName.value
    const selectedOutputRoot = outputRoot.value
    const failedPlatforms = exportTasks.value
      .filter(task => task.status === 'failed')
      .map(task => task.platform)
    const platforms = failedPlatforms.length > 0
      ? failedPlatforms
      : selectedPlatforms(selectedPlatform)
    if (selectedPlatform === 'desktop' && !hasDesktopTargets.value) {
      return
    }

    if (failedPlatforms.length === 0) {
      prepareExportTasks(selectedPlatform)
    }
    startElapsedTimer()
    isStartingExport.value = true

    const updateProgress = (progress: ExportProgress) => {
      isStartingExport.value = false
      updateTask(progress.platform, {
        progress: progress.percentage,
        status: 'running',
        stepKey: progress.step,
      })
    }
    const completeTask = (platform: ExportProgress['platform'], outputPath?: AbsPath) => {
      updateTask(platform, { elapsedMs: elapsedMs.value, outputPath, progress: 100, status: 'completed', stepKey: 'export.progress.finished' })
    }
    const failTask = (platform: ExportProgress['platform'], error: unknown) => {
      updateTask(platform, { elapsedMs: elapsedMs.value, status: 'failed', stepKey: 'export.progress.failed' })
      handleError(error, { context: options.t('export.failed') })
    }
    const runOne = async (platform: ExportPlatform, replaceExisting: boolean) => {
      if (android) {
        publishedExport.value = await androidWorkflow.exportGame({ game: selectedGame, gameName: selectedGameName, onProgress: updateProgress })
        return
      }
      if (!selectedOutputRoot) {
        return
      }
      if (platform === 'web') {
        const outputPath = await exportManager.exportWeb({ game: selectedGame, gameName: selectedGameName, onProgress: updateProgress, outputRoot: selectedOutputRoot, replaceExisting })
        completeTask(platform, outputPath)
        return
      }
      const [targetOs, targetArch] = parsePcTarget(platform)
      updateTask(platform, { status: 'running', stepKey: 'export.progress.downloadingRuntime' })
      const runtimePathForTarget = await runtimePath(targetOs, targetArch)
      const outputPath = await exportManager.exportPc({
        game: selectedGame,
        gameName: selectedGameName,
        onProgress: updateProgress,
        outputRoot: selectedOutputRoot,
        replaceExisting,
        runtimePath: runtimePathForTarget,
        targetArch,
        targetOs,
        windowConfig: windowConfig.value,
      })
      completeTask(platform, outputPath)
    }
    const runWithOverwrite = async (platform: ExportPlatform): Promise<boolean> => {
      try {
        await runOne(platform, false)
        return true
      } catch (error) {
        const target = platform === 'web' ? undefined : parsePcTarget(platform)
        const targetPath = selectedOutputRoot && !android
          ? (platform === 'web' ? resolveWebExportOutputPath(selectedOutputRoot, selectedGameName) : desktopOutputPath(selectedOutputRoot, selectedGameName, target![0], target![1]))
          : undefined
        if (!(error instanceof AppError) || error.code !== 'TARGET_CONFLICT' || !targetPath) {
          throw error
        }
        pendingOverwriteConfirmations.value++
        let confirmed: boolean
        try {
          confirmed = await options.confirmOverwrite(targetPath)
        } finally {
          pendingOverwriteConfirmations.value--
        }
        if (!confirmed) {
          return false
        }
        await runOne(platform, true)
        return true
      }
    }

    try {
      const tasksToRun: ExportPlatform[] = android ? ['web'] : platforms
      let sequence = Promise.resolve()
      for (const platform of tasksToRun) {
        sequence = sequence.then(async () => {
          try {
            const completed = android
              ? (await runOne(platform, false), true)
              : await runWithOverwrite(platform)
            if (completed) {
              const task = exportTasks.value.find(item => item.platform === platform)
              if (task?.status !== 'completed') {
                completeTask(platform)
              }
            }
          } catch (error) {
            failTask(platform, error)
          }
        })
      }
      await sequence
    } finally {
      stopElapsedTimer()
      isStartingExport.value = false
      pendingOverwriteConfirmations.value = 0
    }
  }

  async function openExportDirectory(task: ExportTask): Promise<void> {
    if (android && publishedExport.value) {
      await androidWorkflow.openPublished(publishedExport.value.contentUri)
      return
    }
    if (!task.outputPath) {
      return
    }
    try {
      await openPath(task.outputPath)
    } catch (error) {
      logger.error(`打开导出目录失败: ${error}`)
      toast.error(options.t('export.openDirectoryFailed'))
    }
  }

  async function shareExport(): Promise<void> {
    if (publishedExport.value) {
      await androidWorkflow.sharePublished(publishedExport.value.contentUri)
    }
  }

  return {
    canStart,
    desktopOutputPreview,
    elapsedMs,
    exportTasks,
    handleOpenChange,
    hasDesktopTargets,
    hasOutputTarget,
    isAndroid: android,
    isBusy,
    isRunning,
    openExportDirectory,
    outputPreview,
    outputRoot,
    prepareExportTasks,
    selectOutputRoot,
    selectedDesktopTargets,
    shareExport,
    startExport,
    windowConfig,
  }
}
