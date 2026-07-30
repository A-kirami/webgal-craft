import { openPath } from '@tauri-apps/plugin-opener'

import { createAndroidWebExportWorkflow } from '~/features/export/android-web-export-workflow'
import { desktopDirectoryPicker } from '~/features/resource-import/desktop-directory-picker'
import { exportManager, resolveWebExportOutputPath } from '~/services/export-manager'
import { fromExternalAbsPath } from '~/services/platform/path-boundary'
import { isAndroidRuntime } from '~/services/platform/runtime'
import { AppError } from '~/types/errors'
import { handleError } from '~/utils/error-handler'

import { useExportElapsedTimer } from './useExportElapsedTimer'

import type { Game } from '~/database/model'
import type { AbsPath } from '~/domain/path'

export type WebExportStatus = 'idle' | 'running' | 'completed' | 'failed'

interface UseWebExportDialogOptions {
  android?: boolean
  confirmOverwrite: (outputPath: AbsPath) => Promise<boolean>
  defaultOutputRoot: MaybeRefOrGetter<string>
  game: MaybeRefOrGetter<Game>
  open: Ref<boolean | undefined>
  t: (key: string, values?: Record<string, unknown>) => string
}

export function useWebExportDialog(options: UseWebExportDialogOptions) {
  const android = options.android ?? isAndroidRuntime()
  const androidWorkflow = createAndroidWebExportWorkflow()
  const currentGame = computed(() => toValue(options.game))
  const {
    elapsedMs,
    reset: resetElapsedTimer,
    start: startElapsedTimer,
    stop: stopElapsedTimer,
  } = $(useExportElapsedTimer())

  const gameName = $computed(() => currentGame.value.metadata.name)
  let outputRoot = $ref<AbsPath>()
  let outputPath = $ref<AbsPath>()
  let publishedExport = $ref<{ contentUri: string, displayPath: string }>()
  let progress = $ref(0)
  let isConfirmingOverwrite = $ref(false)
  let isSelectingDirectory = $ref(false)
  let isStartingExport = $ref(false)
  let status = $ref<WebExportStatus>('idle')
  let stepKey = $ref('export.progress.ready')

  const isRunning = $computed(() => status === 'running')
  const isBusy = $computed(() => isConfirmingOverwrite || isSelectingDirectory || isStartingExport || isRunning)
  const desktopOutputPreview = $computed(() => outputRoot
    ? resolveWebExportOutputPath(outputRoot, gameName)
    : undefined,
  )
  const outputPreview = $computed(() => android
    ? publishedExport?.displayPath ?? options.t('export.androidDestination')
    : desktopOutputPreview,
  )
  const hasOutputTarget = $computed(() => android || outputPreview !== undefined)
  const canStart = $computed(() => !isBusy && hasOutputTarget)

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
    outputRoot = configuredOutputRoot()
    outputPath = undefined
    publishedExport = undefined
    progress = 0
    isConfirmingOverwrite = false
    isSelectingDirectory = false
    isStartingExport = false
    status = 'idle'
    stepKey = 'export.progress.ready'
  }

  watch(options.open, (isOpen) => {
    if (isOpen) {
      reset()
    }
  }, { immediate: true })

  watch(() => toValue(options.defaultOutputRoot), () => {
    if (options.open.value && !outputRoot) {
      outputRoot = configuredOutputRoot()
    }
  })

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen && isBusy) {
      return
    }

    options.open.value = nextOpen
  }

  async function selectOutputRoot(): Promise<void> {
    if (android || isBusy) {
      return
    }

    isSelectingDirectory = true
    try {
      const selected = await desktopDirectoryPicker.selectDirectory(
        options.t('export.selectDirectory'),
        outputRoot,
      )
      if (selected) {
        outputRoot = selected
      }
    } catch (error) {
      logger.error(`选择 Web 导出目录失败: ${error}`)
      toast.error(options.t('export.selectDirectoryFailed'))
    } finally {
      isSelectingDirectory = false
    }
  }

  async function startExport(): Promise<void> {
    if (!canStart || (!android && !outputRoot)) {
      return
    }

    const selectedGame = currentGame.value
    const selectedGameName = gameName
    const selectedOutputPath = desktopOutputPreview
    const selectedOutputRoot = outputRoot

    async function runExport(replaceExisting: boolean): Promise<void> {
      if (android) {
        publishedExport = await androidWorkflow.exportGame({
          game: selectedGame,
          gameName: selectedGameName,
          onProgress: updateProgress,
        })
        return
      }
      if (!selectedOutputRoot) {
        return
      }
      outputPath = await exportManager.exportWeb({
        game: selectedGame,
        gameName: selectedGameName,
        outputRoot: selectedOutputRoot,
        replaceExisting,
        onProgress: updateProgress,
      })
    }

    function updateProgress(nextProgress: { percentage: number, step: string }): void {
      isStartingExport = false
      status = 'running'
      progress = nextProgress.percentage
      stepKey = nextProgress.step
    }

    function markCompleted(): void {
      stopElapsedTimer()
      isStartingExport = false
      progress = 100
      status = 'completed'
      stepKey = 'export.progress.finished'
    }

    function markFailed(error: unknown): void {
      stopElapsedTimer()
      isStartingExport = false
      status = 'failed'
      stepKey = 'export.progress.failed'
      handleError(error, { context: options.t('export.failed') })
    }

    outputPath = undefined
    progress = 0
    startElapsedTimer()
    isStartingExport = true

    try {
      await runExport(false)
      markCompleted()
    } catch (error) {
      if (android || !(error instanceof AppError) || error.code !== 'TARGET_CONFLICT' || !selectedOutputPath) {
        markFailed(error)
        return
      }

      resetElapsedTimer()
      isStartingExport = false
      progress = 0
      status = 'idle'
      stepKey = 'export.progress.ready'
      isConfirmingOverwrite = true

      let confirmed = false
      try {
        confirmed = await options.confirmOverwrite(selectedOutputPath)
      } catch (confirmationError) {
        markFailed(confirmationError)
        return
      } finally {
        isConfirmingOverwrite = false
      }

      if (!confirmed) {
        return
      }

      startElapsedTimer()
      isStartingExport = true
      try {
        await runExport(true)
        markCompleted()
      } catch (replacementError) {
        markFailed(replacementError)
      }
    }
  }

  async function openExportDirectory(): Promise<void> {
    if (android && publishedExport) {
      try {
        await androidWorkflow.openPublished(publishedExport.contentUri)
      } catch (error) {
        logger.error(`打开 Android Web 导出文件失败: ${error}`)
        toast.error(options.t('export.openFileFailed'))
      }
      return
    }
    if (!outputPath) {
      return
    }

    try {
      await openPath(outputPath)
    } catch (error) {
      logger.error(`打开 Web 导出目录失败: ${error}`)
      toast.error(options.t('export.openDirectoryFailed'))
    }
  }

  async function shareExport(): Promise<void> {
    if (!publishedExport) {
      return
    }
    try {
      await androidWorkflow.sharePublished(publishedExport.contentUri)
    } catch (error) {
      logger.error(`分享 Android Web 导出文件失败: ${error}`)
      toast.error(options.t('export.shareFailed'))
    }
  }

  return $$({
    canStart,
    elapsedMs,
    handleOpenChange,
    hasOutputTarget,
    isAndroid: android,
    isBusy,
    isRunning,
    openExportDirectory,
    outputPreview,
    outputRoot,
    progress,
    selectOutputRoot,
    shareExport,
    startExport,
    status,
    stepKey,
  })
}
