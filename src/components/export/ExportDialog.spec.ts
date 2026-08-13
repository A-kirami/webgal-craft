import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import {
  createBrowserCheckboxStub,
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
  exportPcMock,
  ensurePcRuntimeMock,
  androidExportMock,
  androidOpenMock,
  androidShareMock,
  confirmExportOverwriteMock,
  existsMock,
  openDialogMock,
  openPathMock,
  toastErrorMock,
  isAndroidRuntimeMock,
  osArchMock,
  osPlatformMock,
} = vi.hoisted(() => ({
  androidExportMock: vi.fn(),
  androidOpenMock: vi.fn(),
  androidShareMock: vi.fn(),
  exportWebMock: vi.fn(),
  exportPcMock: vi.fn(),
  ensurePcRuntimeMock: vi.fn(),
  confirmExportOverwriteMock: vi.fn(),
  existsMock: vi.fn(),
  openDialogMock: vi.fn(),
  openPathMock: vi.fn(),
  toastErrorMock: vi.fn(),
  isAndroidRuntimeMock: vi.fn(),
  osArchMock: vi.fn(),
  osPlatformMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-os', () => ({
  arch: osArchMock,
  platform: osPlatformMock,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: existsMock,
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
    ensurePcRuntime: ensurePcRuntimeMock,
    exportPc: exportPcMock,
    exportWeb: exportWebMock,
  },
  resolvePcExportOutputPath: (outputRoot: string, gameName: string, targetOs: string, targetArch: string) => `${outputRoot}/${gameName}/${targetOs}-${targetArch}`,
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
  Checkbox: createBrowserCheckboxStub('StubCheckbox'),
  Dialog: createBrowserContainerStub('StubDialog'),
  DialogContent: createBrowserContainerStub('StubDialogContent'),
  DialogDescription: createBrowserContainerStub('StubDialogDescription'),
  DialogFooter: createBrowserContainerStub('StubDialogFooter'),
  DialogHeader: createBrowserContainerStub('StubDialogHeader'),
  DialogTitle: createBrowserContainerStub('StubDialogTitle', 'h2'),
  Input: createBrowserInputStub('StubInput'),
  Label: createBrowserContainerStub('StubLabel', 'label'),
  Progress: ProgressStub,
  Switch: createBrowserCheckboxStub('StubSwitch'),
  Tooltip: createBrowserContainerStub('StubTooltip'),
  TooltipContent: createBrowserContainerStub('StubTooltipContent'),
  TooltipProvider: createBrowserContainerStub('StubTooltipProvider'),
  TooltipTrigger: createBrowserContainerStub('StubTooltipTrigger'),
}

function renderExportDialog(options: { exportSavePath?: string, localizedI18n?: boolean } = {}) {
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
      i18nMode: options.localizedI18n ? 'localized' : 'lite',
      pinia,
    },
    global: {
      stubs: globalStubs,
    },
  })
}

async function navigateToConfigureStep(): Promise<void> {
  await page.getByRole('button', { name: /export\.platformWeb/ }).click()
  await page.getByRole('button', { name: 'export.next' }).click()
}

async function navigateToExportStep(): Promise<void> {
  await navigateToConfigureStep()
  await page.getByRole('button', { name: 'export.next' }).click()
}

describe('ExportDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    exportWebMock.mockResolvedValue(AbsPath.from('/exports/Demo Game/web'))
    exportPcMock.mockResolvedValue(AbsPath.from('/exports/Demo Game/windows-x64'))
    ensurePcRuntimeMock.mockResolvedValue(AbsPath.from('/app-data/cache/runtime.exe'))
    androidExportMock.mockResolvedValue({
      kind: 'published',
      contentUri: 'content://media/external/downloads/42',
      displayPath: 'Downloads/WebGALCraft/exports/Demo_Game-web.zip',
    })
    androidOpenMock.mockResolvedValue(undefined)
    androidShareMock.mockResolvedValue(undefined)
    isAndroidRuntimeMock.mockReturnValue(false)
    osArchMock.mockReturnValue('x86_64')
    osPlatformMock.mockReturnValue('windows')
    confirmExportOverwriteMock.mockResolvedValue(true)
    existsMock.mockResolvedValue(false)
    openDialogMock.mockResolvedValue('/selected-exports')
    openPathMock.mockResolvedValue(undefined)
  })

  it('展示所有导出平台且默认不选择任何平台', async () => {
    renderExportDialog()

    await expect.element(page.getByRole('button', { name: /export\.platformWeb/ })).toHaveAttribute('aria-pressed', 'false')
    await expect.element(page.getByRole('button', { name: /export\.platformDesktop/ })).toHaveAttribute('aria-pressed', 'false')
    await expect.element(page.getByRole('button', { name: /export\.platformAndroid/ })).toBeDisabled()
    await expect.element(page.getByRole('button', { name: 'export.next' })).toBeDisabled()
    expect(page.getByText('export.comingSoon').elements()).toHaveLength(1)
  })

  it('选择平台后移除提示并允许进入下一步', async () => {
    renderExportDialog()

    await expect.element(page.getByText('export.selectPlatformHint')).toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'export.next' })).toBeDisabled()

    await page.getByRole('button', { name: /export\.platformWeb/ }).click()
    await expect.element(page.getByText('export.selectPlatformHint')).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'export.next' })).toBeEnabled()
  })

  it('平台类型只能选择一项', async () => {
    renderExportDialog()

    const webPlatform = page.getByRole('button', { name: /export\.platformWeb/ })
    const desktopPlatform = page.getByRole('button', { name: /export\.platformDesktop/ })
    await webPlatform.click()
    await expect.element(webPlatform).toHaveAttribute('aria-pressed', 'true')

    await desktopPlatform.click()
    await expect.element(webPlatform).toHaveAttribute('aria-pressed', 'false')
    await expect.element(desktopPlatform).toHaveAttribute('aria-pressed', 'true')
  })

  it('Web 配置步骤可正常导航，并允许返回已到达步骤', async () => {
    renderExportDialog()

    const configureStep = page.getByRole('button', { name: /export\.steps\.configure/ })
    const exportStep = page.getByRole('button', { name: /export\.steps\.export/ })
    await expect.element(configureStep).toBeDisabled()
    await expect.element(exportStep).toBeDisabled()
    await expect.element(page.getByText('export.steps.notRequired')).not.toBeInTheDocument()

    await page.getByRole('button', { name: /export\.platformWeb/ }).click()
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

    expect(page.getByTestId('export-card').elements()).toHaveLength(1)
    await expect.element(page.getByText('export.platformWeb')).toBeInTheDocument()
    await expect.element(page.getByText('export.progress.ready')).toBeInTheDocument()
    expect(exportWebMock).not.toHaveBeenCalled()

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
    await expect.element(page.getByText('export.status.completed')).not.toBeInTheDocument()
    const platformName = await page.getByText('export.platformWeb').element() as HTMLElement
    const exportLog = await page.getByText('export.progress.finished').element() as HTMLElement
    expect(exportLog.getBoundingClientRect().top).toBeGreaterThanOrEqual(platformName.getBoundingClientRect().bottom)
    const exportCard = await page.getByTestId('export-card').element() as HTMLElement
    expect(exportCard.classList).toContain('border-emerald-500/40')
    expect(progress.classList).toContain('bg-emerald-500')
    const exportStep = await page.getByRole('button', { name: /export\.steps\.export/ }).element() as HTMLButtonElement
    expect(exportStep.querySelector('svg')).not.toBeNull()
    await expect.element(page.getByRole('button', { name: 'common.close' })).not.toBeInTheDocument()
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
    const exportCard = await page.getByTestId('export-card').element() as HTMLElement
    expect(exportCard.classList).toContain('border-destructive/40')
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
    await expect.element(page.getByText('export.progress.ready')).toBeInTheDocument()
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

  it('Android 保持 Web 导出可选但禁用桌面端', async () => {
    isAndroidRuntimeMock.mockReturnValue(true)
    renderExportDialog()

    await expect.element(page.getByRole('button', { name: /export\.platformWeb/ })).toBeEnabled()
    await expect.element(page.getByRole('button', { name: /export\.platformDesktop/ })).toBeDisabled()
    await expect.element(page.getByText('export.desktopOnly')).toBeInTheDocument()
  })

  it('桌面端为每个选中的目标独立下载运行时并导出', async () => {
    renderExportDialog({ localizedI18n: true })

    await page.getByRole('button', { name: '桌面端' }).click()
    await page.getByRole('button', { name: '下一步' }).click()
    await page.getByRole('checkbox', { name: 'macOS x64' }).click()
    await expect.element(page.getByText('最终输出位置: /exports/Demo Game')).toBeInTheDocument()

    await page.getByRole('button', { name: '下一步' }).click()
    expect(page.getByTestId('export-card').elements()).toHaveLength(2)
    await expect.element(page.getByText('Windows x64')).toBeInTheDocument()
    await expect.element(page.getByText('macOS x64')).toBeInTheDocument()
    const progressCards = page.getByTestId('export-card').elements()
    expect(progressCards[0].querySelector('.i-simple-icons-windows')).not.toBeNull()
    expect(progressCards[1].querySelector('.i-simple-icons-apple')).not.toBeNull()
    expect(exportPcMock).not.toHaveBeenCalled()
    await page.getByRole('button', { name: '开始导出' }).click()

    await vi.waitFor(() => {
      expect(ensurePcRuntimeMock).toHaveBeenCalledTimes(2)
      expect(exportPcMock).toHaveBeenCalledTimes(2)
    })
    expect(ensurePcRuntimeMock.mock.calls).toEqual(expect.arrayContaining([
      ['windows', 'x64', ''],
      ['macos', 'x64', ''],
    ]))
    expect(exportPcMock.mock.calls.map(([config]) => [config.targetOs, config.targetArch])).toEqual(expect.arrayContaining([
      ['windows', 'x64'],
      ['macos', 'x64'],
    ]))
    expect(exportPcMock.mock.calls.every(([config]) => config.windowConfig.height === 760)).toBe(true)
  })

  it('桌面端存在目标目录时在下载运行时前确认覆盖', async () => {
    existsMock.mockResolvedValue(true)
    let confirmOverwrite: (() => void) | undefined
    confirmExportOverwriteMock.mockImplementationOnce(() => new Promise<boolean>((resolve) => {
      confirmOverwrite = () => resolve(true)
    }))
    renderExportDialog({ localizedI18n: true })

    await page.getByRole('button', { name: '桌面端' }).click()
    await page.getByRole('button', { name: '下一步' }).click()
    await page.getByRole('button', { name: '下一步' }).click()
    await page.getByRole('button', { name: '开始导出' }).click()

    await vi.waitFor(() => {
      expect(confirmExportOverwriteMock).toHaveBeenCalledWith(
        '/exports/Demo Game/windows-x64',
        expect.any(Function),
      )
    })
    expect(ensurePcRuntimeMock).not.toHaveBeenCalled()

    confirmOverwrite?.()
    await vi.waitFor(() => {
      expect(ensurePcRuntimeMock).toHaveBeenCalledOnce()
      expect(exportPcMock).toHaveBeenCalledWith(expect.objectContaining({ replaceExisting: true }))
    })
  })

  it('重试仅重新导出失败的桌面目标', async () => {
    exportPcMock.mockImplementation(config => config.targetOs === 'windows'
      ? Promise.resolve(AbsPath.from('/exports/Demo Game/windows-x64'))
      : Promise.reject(new Error('disk full')))
    renderExportDialog({ localizedI18n: true })

    await page.getByRole('button', { name: '桌面端' }).click()
    await page.getByRole('button', { name: '下一步' }).click()
    await page.getByRole('checkbox', { name: 'macOS x64' }).click()
    await page.getByRole('button', { name: '下一步' }).click()
    await page.getByRole('button', { name: '开始导出' }).click()

    await expect.element(page.getByRole('button', { name: '重新导出' })).toBeEnabled()
    exportPcMock.mockResolvedValue(AbsPath.from('/exports/Demo Game/macos-x64'))
    await page.getByRole('button', { name: '重新导出' }).click()

    await vi.waitFor(() => {
      expect(exportPcMock.mock.calls.map(([config]) => config.targetOs)).toEqual([
        'windows',
        'macos',
        'macos',
      ])
    })
  })

  it('桌面目标按顺序导出', async () => {
    let completeWindows: (() => void) | undefined
    exportPcMock.mockImplementation(config => new Promise<AbsPath>((resolve) => {
      if (config.targetOs === 'windows') {
        completeWindows = () => resolve(AbsPath.from('/exports/Demo Game/windows-x64'))
      }
    }))
    renderExportDialog({ localizedI18n: true })

    await page.getByRole('button', { name: '桌面端' }).click()
    await page.getByRole('button', { name: '下一步' }).click()
    await page.getByRole('checkbox', { name: 'macOS x64' }).click()
    await page.getByRole('button', { name: '下一步' }).click()
    await page.getByRole('button', { name: '开始导出' }).click()
    await vi.waitFor(() => expect(exportPcMock).toHaveBeenCalledOnce())
    expect(exportPcMock.mock.calls[0][0].targetOs).toBe('windows')

    completeWindows?.()
    await vi.waitFor(() => {
      expect(exportPcMock.mock.calls.map(([config]) => config.targetOs)).toEqual([
        'windows',
        'macos',
      ])
    })
  })

  it('桌面目标以横排图标卡片展示', async () => {
    renderExportDialog({ localizedI18n: true })

    await page.getByRole('button', { name: '桌面端' }).click()
    await page.getByRole('button', { name: '下一步' }).click()

    const targetGrid = await page.getByTestId('desktop-target-grid').element() as HTMLElement
    expect(targetGrid.classList).toContain('sm:grid-cols-4')
    const windowsTarget = await page.getByRole('checkbox', { name: 'Windows x64' }).element() as HTMLInputElement
    expect(windowsTarget.classList).toContain('sr-only')
    expect(windowsTarget.closest('label')?.classList).toContain('grid-rows-[2rem_1.5rem]')
    expect(targetGrid.querySelector('.i-simple-icons-windows')).not.toBeNull()
    expect(targetGrid.querySelector('.i-simple-icons-linux')).not.toBeNull()
    expect(targetGrid.querySelectorAll('.i-simple-icons-apple')).toHaveLength(2)
  })

  it('窗口尺寸输入始终保持有效且不小于最小尺寸', async () => {
    renderExportDialog({ localizedI18n: true })

    await page.getByRole('button', { name: '桌面端' }).click()
    await page.getByRole('button', { name: '下一步' }).click()
    const width = page.getByRole('spinbutton', { name: '宽度', exact: true })
    const minWidth = page.getByRole('spinbutton', { name: '最小宽度', exact: true })

    await width.fill('640')
    await expect.element(minWidth).toHaveValue(640)
    await width.fill('')
    await expect.element(width).toHaveValue(1)
    await minWidth.fill('900')

    await page.getByRole('button', { name: '下一步' }).click()
    await page.getByRole('button', { name: '开始导出' }).click()
    await vi.waitFor(() => {
      expect(exportPcMock).toHaveBeenCalledWith(expect.objectContaining({
        windowConfig: expect.objectContaining({ minWidth: 1, width: 1 }),
      }))
    })
  })

  it.each([
    { arch: 'x86_64', platform: 'windows', target: 'Windows x64' },
    { arch: 'x86_64', platform: 'linux', target: 'Linux x64' },
    { arch: 'x86_64', platform: 'macos', target: 'macOS x64' },
    { arch: 'aarch64', platform: 'macos', target: 'macOS Apple Silicon' },
  ])('桌面端根据 $platform/$arch 预选 $target', async ({ arch, platform, target }) => {
    osArchMock.mockReturnValue(arch)
    osPlatformMock.mockReturnValue(platform)
    renderExportDialog({ localizedI18n: true })

    await page.getByRole('button', { name: '桌面端' }).click()
    await page.getByRole('button', { name: '下一步' }).click()

    await expect.element(page.getByRole('checkbox', { name: target })).toBeChecked()
    const otherTargets = ['Windows x64', 'macOS x64', 'macOS Apple Silicon', 'Linux x64']
      .filter(label => label !== target)
    await Promise.all(otherTargets.map(label => (
      expect.element(page.getByRole('checkbox', { name: label })).not.toBeChecked()
    )))
  })
})
