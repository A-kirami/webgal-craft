import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { openPath } from '@tauri-apps/plugin-opener'

import { exportManager, resolveWebExportOutputPath } from '~/services/export-manager'
import { fromExternalAbsPath } from '~/services/platform/path-boundary'
import { AppError } from '~/types/errors'
import { handleError } from '~/utils/error-handler'

import { useExportElapsedTimer } from './useExportElapsedTimer'

import type { Game } from '~/database/model'
import type { AbsPath } from '~/domain/path'

export type WebExportStatus = 'idle' | 'running' | 'completed' | 'failed'

interface UseWebExportDialogOptions {
  confirmOverwrite: (outputPath: AbsPath) => Promise<boolean>
  defaultOutputRoot: MaybeRefOrGetter<string>
  game: MaybeRefOrGetter<Game>
  open: Ref<boolean | undefined>
  t: (key: string, values?: Record<string, unknown>) => string
}

export function useWebExportDialog(options: UseWebExportDialogOptions) {
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
  let progress = $ref(0)
  let isConfirmingOverwrite = $ref(false)
  let isSelectingDirectory = $ref(false)
  let isStartingExport = $ref(false)
  let status = $ref<WebExportStatus>('idle')
  let stepKey = $ref('export.progress.ready')

  const isRunning = $computed(() => status === 'running')
  const isBusy = $computed(() => isConfirmingOverwrite || isSelectingDirectory || isStartingExport || isRunning)
  const outputPreview = $computed(() => outputRoot
    ? resolveWebExportOutputPath(outputRoot, gameName)
    : undefined,
  )
  const canStart = $computed(() => !isBusy && outputPreview !== undefined)

  function configuredOutputRoot(): AbsPath | undefined {
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
    if (isBusy) {
      return
    }

    isSelectingDirectory = true
    try {
      const selected = await openDialog({
        defaultPath: outputRoot,
        directory: true,
        multiple: false,
        title: options.t('export.selectDirectory'),
      })
      if (typeof selected === 'string') {
        outputRoot = fromExternalAbsPath(selected)
      }
    } catch (error) {
      logger.error(`选择 Web 导出目录失败: ${error}`)
      toast.error(options.t('export.selectDirectoryFailed'))
    } finally {
      isSelectingDirectory = false
    }
  }

  async function startExport(): Promise<void> {
    if (!canStart || !outputRoot) {
      return
    }

    const selectedGame = currentGame.value
    const selectedGameName = gameName
    const selectedOutputPath = outputPreview
    const selectedOutputRoot = outputRoot

    async function runExport(replaceExisting: boolean): Promise<void> {
      outputPath = await exportManager.exportWeb({
        game: selectedGame,
        gameName: selectedGameName,
        outputRoot: selectedOutputRoot,
        replaceExisting,
        onProgress: (nextProgress) => {
          isStartingExport = false
          status = 'running'
          progress = nextProgress.percentage
          stepKey = nextProgress.step
        },
      })
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
      if (!(error instanceof AppError) || error.code !== 'TARGET_CONFLICT' || !selectedOutputPath) {
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

  return $$({
    canStart,
    elapsedMs,
    handleOpenChange,
    isBusy,
    isRunning,
    openExportDirectory,
    outputPreview,
    outputRoot,
    progress,
    selectOutputRoot,
    startExport,
    status,
    stepKey,
  })
}
