import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  createBrowserInputStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { createTestGame } from '~/__tests__/factories'
import { AbsPath } from '~/domain/path'
import { useStorageSettingsStore } from '~/stores/storage-settings'
import { AppError } from '~/types/errors'

import ExportDialog from './ExportDialog.vue'

const {
  exportWebMock,
  androidExportMock,
  androidOpenMock,
  androidShareMock,
  confirmExportOverwriteMock,
  openDialogMock,
  openPathMock,
  toastErrorMock,
  isAndroidRuntimeMock,
} = vi.hoisted(() => ({
  androidExportMock: vi.fn(),
  androidOpenMock: vi.fn(),
  androidShareMock: vi.fn(),
  exportWebMock: vi.fn(),
  confirmExportOverwriteMock: vi.fn(),
  openDialogMock: vi.fn(),
  openPathMock: vi.fn(),
  toastErrorMock: vi.fn(),
  isAndroidRuntimeMock: vi.fn(),
}))

vi.mock('~/services/platform/runtime', () => ({
  isAndroidRuntime: isAndroidRuntimeMock,
}))

vi.mock('~/features/export/android-web-export-workflow', () => ({
  createAndroidWebExportWorkflow: () => ({
    exportGame: androidExportMock,
    openPublished: androidOpenMock,
    sharePublished: androidShareMock,
  }),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openDialogMock,
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  error: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: openPathMock,
}))

vi.mock('~/features/export/confirmExportOverwrite', () => ({
  confirmExportOverwrite: confirmExportOverwriteMock,
}))

vi.mock('~/services/export-manager', () => ({
  exportManager: {
    exportWeb: exportWebMock,
  },
  resolveWebExportOutputPath: (outputRoot: string, gameName: string) => `${outputRoot}/${gameName}/web`,
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: toastErrorMock,
  },
}))

const ProgressStub = defineComponent({
  name: 'ProgressStub',
  props: {
    indicatorClass: {
      type: String,
      default: '',
    },
    modelValue: {
      type: Number,
      default: 0,
    },
  },
  setup(props) {
    return () => h('progress', {
      class: props.indicatorClass,
      max: 100,
      value: props.modelValue,
    })
  },
})

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  Dialog: createBrowserContainerStub('StubDialog'),
  DialogContent: createBrowserContainerStub('StubDialogContent'),
  DialogDescription: createBrowserContainerStub('StubDialogDescription'),
  DialogFooter: createBrowserContainerStub('StubDialogFooter'),
  DialogHeader: createBrowserContainerStub('StubDialogHeader'),
  DialogTitle: createBrowserContainerStub('StubDialogTitle', 'h2'),
  Input: createBrowserInputStub('StubInput'),
  Label: createBrowserContainerStub('StubLabel', 'label'),
  Progress: ProgressStub,
  Tooltip: createBrowserContainerStub('StubTooltip'),
  TooltipContent: createBrowserContainerStub('StubTooltipContent'),
  TooltipProvider: createBrowserContainerStub('StubTooltipProvider'),
  TooltipTrigger: createBrowserContainerStub('StubTooltipTrigger'),
}

function renderExportDialog(options: { exportSavePath?: string } = {}) {
  const pinia = createPinia()
  useStorageSettingsStore(pinia).exportSavePath = options.exportSavePath ?? '/exports'

  renderInBrowser(ExportDialog, {
    props: {
      'game': createTestGame({
        engineId: 'engine-1',
        metadata: { name: 'Demo Game' },
      }),
      'open': true,
      'onUpdate:open': vi.fn(),
    },
    browser: {
      i18nMode: 'lite',
      pinia,
    },
    global: {
      stubs: globalStubs,
    },
  })
}

async function navigateToConfigureStep(): Promise<void> {
  await page.getByRole('button', { name: 'export.next' }).click()
}

async function navigateToExportStep(): Promise<void> {
  await page.getByRole('button', { name: 'export.next' }).click()
  await page.getByRole('button', { name: 'export.next' }).click()
}

describe('ExportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    exportWebMock.mockResolvedValue(AbsPath.from('/exports/Demo Game/web'))
    androidExportMock.mockResolvedValue({
      kind: 'published',
      contentUri: 'content://media/external/downloads/42',
      displayPath: 'Downloads/WebGALCraft/exports/Demo_Game-web.zip',
    })
    androidOpenMock.mockResolvedValue(undefined)
    androidShareMock.mockResolvedValue(undefined)
    isAndroidRuntimeMock.mockReturnValue(false)
    confirmExportOverwriteMock.mockResolvedValue(true)
    openDialogMock.mockResolvedValue('/selected-exports')
    openPathMock.mockResolvedValue(undefined)
  })

  it('展示所有导出平台，并禁用尚未支持的平台', async () => {
    renderExportDialog()

    await expect.element(page.getByRole('button', { name: /export\.platformWeb/ })).toBeEnabled()
    await expect.element(page.getByRole('button', { name: /export\.platformDesktop/ })).toBeDisabled()
    await expect.element(page.getByRole('button', { name: /export\.platformAndroid/ })).toBeDisabled()
    expect(page.getByText('export.comingSoon').elements()).toHaveLength(2)
  })

  it('取消选中所有平台时提示至少选择一个平台并禁用下一步', async () => {
    renderExportDialog()

    await expect.element(page.getByText('export.selectPlatformHint')).not.toBeInTheDocument()

    await page.getByRole('button', { name: /export\.platformWeb/ }).click()

    await expect.element(page.getByText('export.selectPlatformHint')).toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'export.next' })).toBeDisabled()

    await page.getByRole('button', { name: /export\.platformWeb/ }).click()
    await expect.element(page.getByText('export.selectPlatformHint')).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'export.next' })).toBeEnabled()
  })

  it('Web 配置步骤可正常导航，并允许返回已到达步骤', async () => {
    renderExportDialog()

    const configureStep = page.getByRole('button', { name: /export\.steps\.configure/ })
    const exportStep = page.getByRole('button', { name: /export\.steps\.export/ })
    await expect.element(configureStep).toBeDisabled()
    await expect.element(exportStep).toBeDisabled()
    await expect.element(page.getByText('export.steps.notRequired')).not.toBeInTheDocument()

    await page.getByRole('button', { name: 'export.next' }).click()

    await expect.element(page.getByLabelText('export.outputDirectory')).toBeInTheDocument()
    await expect.element(page.getByLabelText('export.gameName')).not.toBeInTheDocument()
    const outputRootInput = await page.getByLabelText('export.outputDirectory').element() as HTMLInputElement
    const browseButton = await page.getByRole('button', { name: 'export.browse' }).element() as HTMLButtonElement
    expect(outputRootInput.classList).toContain('h-8')
    expect(outputRootInput.classList).toContain('shadow-none')
    expect(browseButton.classList).toContain('text-xs')
    expect(browseButton.classList).toContain('font-normal')
    expect(browseButton.classList).toContain('h-8')
    expect(browseButton.classList).toContain('shadow-none')
    expect(browseButton.querySelector('svg')).toBeNull()
    await expect.element(configureStep).toBeEnabled()
    await expect.element(page.getByRole('button', { name: 'export.previousStep' })).toBeEnabled()

    await page.getByRole('button', { name: 'export.previousStep' }).click()
    await expect.element(page.getByRole('button', { name: /export\.platformWeb/ })).toBeInTheDocument()

    await page.getByRole('button', { name: 'export.next' }).click()
    await page.getByRole('button', { name: 'export.next' }).click()

    await expect.element(page.getByText('export.progress.ready')).toBeInTheDocument()
    await expect.element(configureStep).toBeEnabled()
    await expect.element(exportStep).toBeEnabled()
  })

  it('选择目录后展示进度与完成状态，并可打开输出目录', async () => {
    let completeExport: (() => void) | undefined
    exportWebMock.mockImplementation(config => new Promise<AbsPath>((resolve) => {
      config.onProgress?.({
        exportId: 'export-1',
        percentage: 72.6,
        platform: 'web',
        step: 'export.progress.copyingGame',
      })
      completeExport = () => resolve(AbsPath.from('/exports/Demo Game/web'))
    }))
    renderExportDialog()

    await navigateToConfigureStep()
    const outputRootInput = await page.getByLabelText('export.outputDirectory').element() as HTMLInputElement
    expect(outputRootInput.value).toBe('/exports')
    await expect.element(page.getByText('export.finalOutputPath: /exports/Demo Game/web')).toBeInTheDocument()

    await page.getByRole('button', { name: 'export.next' }).click()

    await page.getByRole('button', { name: 'export.start' }).click()

    await vi.waitFor(() => {
      expect(exportWebMock).toHaveBeenCalledWith(expect.objectContaining({
        gameName: 'Demo Game',
        outputRoot: '/exports',
      }))
    })
    expect(openDialogMock).not.toHaveBeenCalled()
    await expect.element(page.getByText('export.progress.copyingGame')).toBeInTheDocument()
    await expect.element(page.getByText(/export\.elapsed\./)).not.toBeInTheDocument()
    const progress = await page.getByRole('progressbar').element() as HTMLProgressElement
    expect(progress.value).toBe(72.6)
    await expect.element(page.getByText('73%')).toBeInTheDocument()

    completeExport?.()
    await expect.element(page.getByText('export.progress.finished')).toBeInTheDocument()
    await expect.element(page.getByText(/export\.elapsed\.total/)).toBeInTheDocument()
    await expect.element(page.getByText('export.status.completed')).not.toBeInTheDocument()
    const platformName = await page.getByText('export.platformWeb').element() as HTMLElement
    const exportLog = await page.getByText('export.progress.finished').element() as HTMLElement
    const logSummary = await page.getByTestId('export-log-summary').element() as HTMLElement
    const logSummaryText = logSummary.textContent ?? ''
    expect(exportLog.getBoundingClientRect().top).toBeGreaterThanOrEqual(platformName.getBoundingClientRect().bottom)
    expect(logSummary.classList).toContain('leading-4')
    expect(exportLog.parentElement).toBe(logSummary)
    expect(logSummaryText.indexOf('export.progress.finished')).toBeLessThan(logSummaryText.indexOf('export.elapsed.total'))
    const exportCard = await page.getByTestId('export-card').element() as HTMLElement
    const platformIcon = await page.getByTestId('export-platform-icon').element() as HTMLElement
    expect(exportCard.classList).toContain('border-emerald-500/40')
    expect(platformIcon.classList).toContain('bg-emerald-500/10')
    expect(platformIcon.classList).toContain('text-emerald-600')
    expect(progress.classList).toContain('bg-emerald-500')
    const exportStep = await page.getByRole('button', { name: /export\.steps\.export/ }).element() as HTMLButtonElement
    expect(exportStep.querySelector('svg')).not.toBeNull()
    await expect.element(page.getByRole('button', { name: 'common.close' })).not.toBeInTheDocument()
    const footer = await page.getByTestId('export-dialog-footer').element() as HTMLElement
    expect(footer.classList).toContain('min-h-9')
    await expect.element(page.getByRole('button', { name: 'export.done' })).toBeInTheDocument()
    expect(progress.value).toBe(100)

    const openDirectoryButton = await page.getByRole('button', { name: 'export.openDirectory' }).element() as HTMLButtonElement
    expect(openDirectoryButton.closest('section')).not.toBeNull()
    openDirectoryButton.click()
    expect(openPathMock).toHaveBeenCalledWith('/exports/Demo Game/web')
  })

  it('没有默认目录且取消目录选择时不启动导出', async () => {
    openDialogMock.mockResolvedValue(undefined)
    renderExportDialog({ exportSavePath: '' })
    await navigateToConfigureStep()

    await expect.element(page.getByText('export.selectDirectoryHint')).toBeInTheDocument()
    await expect.element(page.getByText(/export\.finalOutputPath/)).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'export.next' })).toBeDisabled()
    await page.getByRole('button', { name: 'export.browse' }).click()

    expect(exportWebMock).not.toHaveBeenCalled()
    expect(openDialogMock).toHaveBeenCalledOnce()
    await expect.element(page.getByRole('button', { name: 'export.next' })).toBeDisabled()
  })

  it('允许临时覆盖默认导出目录', async () => {
    renderExportDialog()
    await navigateToConfigureStep()

    await page.getByRole('button', { name: 'export.browse' }).click()

    expect(openDialogMock).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: '/exports',
    }))
    const outputRootInput = await page.getByLabelText('export.outputDirectory').element() as HTMLInputElement
    expect(outputRootInput.value).toBe('/selected-exports')
    await expect.element(page.getByText('export.finalOutputPath: /selected-exports/Demo Game/web')).toBeInTheDocument()

    await page.getByRole('button', { name: 'export.next' }).click()

    await page.getByRole('button', { name: 'export.start' }).click()
    await vi.waitFor(() => {
      expect(exportWebMock).toHaveBeenCalledWith(expect.objectContaining({
        outputRoot: '/selected-exports',
      }))
    })
  })

  it('拒绝目录选择器返回的非绝对路径', async () => {
    openDialogMock.mockResolvedValue('relative/exports')
    renderExportDialog({ exportSavePath: '' })
    await navigateToConfigureStep()

    await page.getByRole('button', { name: 'export.browse' }).click()

    expect(toastErrorMock).toHaveBeenCalledWith('export.selectDirectoryFailed')
    await expect.element(page.getByRole('button', { name: 'export.next' })).toBeDisabled()
  })

  it('目录选择未完成时忽略重复选择请求', async () => {
    let resolveSelection: ((value: undefined) => void) | undefined
    openDialogMock.mockImplementation(() => new Promise<undefined>((resolve) => {
      resolveSelection = resolve
    }))
    renderExportDialog({ exportSavePath: '' })
    await navigateToConfigureStep()

    const browseButton = await page.getByRole('button', { name: 'export.browse' }).element() as HTMLButtonElement
    browseButton.click()

    await vi.waitFor(() => {
      expect(browseButton.disabled).toBe(true)
    })
    browseButton.click()
    expect(openDialogMock).toHaveBeenCalledOnce()
    expect(exportWebMock).not.toHaveBeenCalled()

    resolveSelection?.(undefined)
    await vi.waitFor(() => {
      expect(browseButton.disabled).toBe(false)
    })
  })

  it('导出失败时保留弹窗并提供重试入口', async () => {
    exportWebMock.mockRejectedValue(new Error('disk full'))
    renderExportDialog()
    await navigateToExportStep()

    await page.getByRole('button', { name: 'export.start' }).click()

    await vi.waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('export.failed: disk full')
    })
    await expect.element(page.getByText('export.progress.failed')).toBeInTheDocument()
    await expect.element(page.getByText(/export\.elapsed\.total/)).toBeInTheDocument()
    const exportCard = await page.getByTestId('export-card').element() as HTMLElement
    const platformIcon = await page.getByTestId('export-platform-icon').element() as HTMLElement
    expect(exportCard.classList).toContain('border-destructive/40')
    expect(platformIcon.classList).toContain('bg-destructive/10')
    expect(platformIcon.classList).toContain('text-destructive')
    const progress = await page.getByRole('progressbar').element() as HTMLProgressElement
    expect(progress.classList).toContain('bg-destructive')
    const exportStep = await page.getByRole('button', { name: /export\.steps\.export/ }).element() as HTMLButtonElement
    expect(exportStep.querySelector('svg')).toBeNull()
    expect(exportStep.textContent).toContain('3')
    await expect.element(page.getByRole('button', { name: 'export.retry' })).toBeEnabled()
  })

  it('确认后完整覆盖已存在的导出目录', async () => {
    exportWebMock
      .mockRejectedValueOnce(new AppError('TARGET_CONFLICT', 'target exists'))
      .mockResolvedValueOnce(AbsPath.from('/exports/Demo Game/web'))
    renderExportDialog()
    await navigateToExportStep()

    await page.getByRole('button', { name: 'export.start' }).click()

    await vi.waitFor(() => {
      expect(confirmExportOverwriteMock).toHaveBeenCalledWith(
        '/exports/Demo Game/web',
        expect.any(Function),
      )
      expect(exportWebMock).toHaveBeenCalledTimes(2)
    })
    expect(exportWebMock.mock.calls[0][0]).toEqual(expect.objectContaining({ replaceExisting: false }))
    expect(exportWebMock.mock.calls[1][0]).toEqual(expect.objectContaining({ replaceExisting: true }))
    expect(toastErrorMock).not.toHaveBeenCalled()
    await expect.element(page.getByText('export.progress.finished')).toBeInTheDocument()
  })

  it('目标冲突探测期间保持忙碌状态且不重复启动', async () => {
    let rejectExport: ((error: unknown) => void) | undefined
    exportWebMock.mockImplementationOnce(() => {
      return new Promise<AbsPath>((_resolve, reject) => {
        rejectExport = reject
      })
    })
    confirmExportOverwriteMock.mockResolvedValue(false)
    renderExportDialog()
    await navigateToExportStep()

    const startButton = await page.getByRole('button', { name: 'export.start' }).element() as HTMLButtonElement
    startButton.click()

    await vi.waitFor(() => {
      expect(exportWebMock).toHaveBeenCalledOnce()
    })
    const exportLog = await page.getByTestId('export-log-summary').element() as HTMLElement
    expect(exportLog.textContent).toContain('export.progress.ready')
    expect(exportLog.textContent).not.toContain('export.progress.preparing')
    expect(startButton.disabled).toBe(true)

    startButton.click()
    expect(exportWebMock).toHaveBeenCalledOnce()

    rejectExport?.(new AppError('TARGET_CONFLICT', 'target exists'))
    await vi.waitFor(() => {
      expect(confirmExportOverwriteMock).toHaveBeenCalledOnce()
    })
    await expect.element(page.getByText('export.progress.ready')).toBeInTheDocument()
  })

  it('取消覆盖后保留待导出状态且不显示错误 Toast', async () => {
    exportWebMock.mockRejectedValueOnce(new AppError('TARGET_CONFLICT', 'target exists'))
    confirmExportOverwriteMock.mockResolvedValue(false)
    renderExportDialog()
    await navigateToExportStep()

    await page.getByRole('button', { name: 'export.start' }).click()

    await vi.waitFor(() => {
      expect(confirmExportOverwriteMock).toHaveBeenCalledOnce()
    })
    expect(exportWebMock).toHaveBeenCalledOnce()
    expect(toastErrorMock).not.toHaveBeenCalled()
    await expect.element(page.getByText('export.progress.ready')).toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'export.start' })).toBeEnabled()
  })

  it('Android 使用固定 Downloads 目标并提供打开文件和分享操作', async () => {
    isAndroidRuntimeMock.mockReturnValue(true)
    renderExportDialog()

    await navigateToConfigureStep()
    const outputInput = await page.getByLabelText('export.outputDirectory').element() as HTMLInputElement
    expect(outputInput.value).toBe('export.androidDestination')
    await expect.element(page.getByRole('button', { name: 'export.browse' })).not.toBeInTheDocument()
    expect(openDialogMock).not.toHaveBeenCalled()

    await page.getByRole('button', { name: 'export.next' }).click()
    await page.getByRole('button', { name: 'export.start' }).click()

    await vi.waitFor(() => expect(androidExportMock).toHaveBeenCalledOnce())
    await expect.element(page.getByText('export.progress.finished')).toBeInTheDocument()
    await expect.element(page.getByText('Downloads/WebGALCraft/exports/Demo_Game-web.zip')).toBeInTheDocument()
    const openFileButton = await page.getByRole('button', { name: 'export.openFile' }).element() as HTMLButtonElement
    const shareButton = await page.getByRole('button', { name: 'export.share' }).element() as HTMLButtonElement
    openFileButton.click()
    shareButton.click()

    await vi.waitFor(() => {
      expect(androidOpenMock).toHaveBeenCalledWith('content://media/external/downloads/42')
      expect(androidShareMock).toHaveBeenCalledWith('content://media/external/downloads/42')
    })
    expect(openPathMock).not.toHaveBeenCalled()
    expect(confirmExportOverwriteMock).not.toHaveBeenCalled()
  })
})
