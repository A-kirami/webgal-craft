import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, nextTick } from 'vue'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  createBrowserInputStub,
  createBrowserValueStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { RelPath } from '~/domain/path'

import IconEditorDialog from './IconEditorDialog.vue'

import type { IconExportOutput } from '~/features/modals/game-config/icon-editor/icon-editor-export'
import type { IconEditorSourceData } from '~/features/modals/game-config/icon-editor/icon-editor-source'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

const {
  buildIconExportOutputsMock,
  handleErrorMock,
  loadIconEditorSourceDataMock,
  openDialogMock,
  readFileMock,
  refreshRegisteredGameSnapshotMock,
  saveIconEditorOutputsMock,
  fromExternalAbsPathMock,
} = vi.hoisted(() => ({
  buildIconExportOutputsMock: vi.fn(),
  fromExternalAbsPathMock: vi.fn(),
  handleErrorMock: vi.fn(),
  loadIconEditorSourceDataMock: vi.fn(),
  openDialogMock: vi.fn(),
  readFileMock: vi.fn(),
  refreshRegisteredGameSnapshotMock: vi.fn(),
  saveIconEditorOutputsMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openDialogMock,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: readFileMock,
}))

vi.mock('~/features/modals/game-config/icon-editor/icon-editor-export', () => ({
  buildIconExportOutputs: buildIconExportOutputsMock,
  saveIconEditorOutputs: saveIconEditorOutputsMock,
}))

vi.mock('~/features/modals/game-config/icon-editor/icon-editor-source', () => ({
  loadIconEditorSourceData: loadIconEditorSourceDataMock,
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    refreshRegisteredGameSnapshot: refreshRegisteredGameSnapshotMock,
  },
}))

vi.mock('~/services/platform/path-boundary', () => ({
  fromExternalAbsPath: fromExternalAbsPathMock,
}))

vi.mock('~/utils/error-handler', () => ({
  handleError: handleErrorMock,
}))

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  ColorPicker: createBrowserValueStub('StubColorPicker', 'button'),
  Dialog: createBrowserContainerStub('StubDialog'),
  DialogContent: createBrowserContainerStub('StubDialogContent', 'section'),
  DialogDescription: createBrowserContainerStub('StubDialogDescription'),
  DialogFooter: createBrowserContainerStub('StubDialogFooter'),
  DialogHeader: createBrowserContainerStub('StubDialogHeader'),
  DialogTitle: createBrowserContainerStub('StubDialogTitle'),
  IconEditorPreviewCanvas: createBrowserContainerStub('StubIconEditorPreviewCanvas', 'canvas'),
  Input: createBrowserInputStub('StubInput'),
  InputGroup: createBrowserContainerStub('StubInputGroup'),
  InputGroupAddon: createBrowserContainerStub('StubInputGroupAddon'),
  InputGroupInput: createBrowserInputStub('StubInputGroupInput'),
  ScrollArea: createBrowserContainerStub('StubScrollArea'),
  Slider: createBrowserContainerStub('StubSlider'),
}

function createColorPickerUpdateStub(payload: unknown) {
  return defineComponent({
    name: 'StubColorPicker',
    props: {
      modelValue: {
        type: [Object, String],
        default: undefined,
      },
    },
    emits: ['update:modelValue'],
    setup(props, { attrs, emit }) {
      return () => h('button', {
        ...attrs,
        type: 'button',
        value: String(props.modelValue ?? ''),
        onClick: () => emit('update:modelValue', payload),
      }, 'color')
    },
  })
}

function createSliderUpdateSequenceStub(payloads: number[][]) {
  let payloadIndex = 0

  return defineComponent({
    name: 'StubSlider',
    props: {
      modelValue: {
        type: Array,
        default: undefined,
      },
    },
    emits: ['update:modelValue'],
    setup(props, { attrs, emit }) {
      return () => h('button', {
        ...attrs,
        type: 'button',
        value: String(props.modelValue?.[0] ?? ''),
        onClick: () => {
          const payload = payloads[Math.min(payloadIndex, payloads.length - 1)]
          payloadIndex += 1
          emit('update:modelValue', payload)
        },
      }, 'slider')
    },
  })
}

function mockImageLoading() {
  vi.stubGlobal('Image', class {
    errorHandler?: () => void
    loadHandler?: () => void

    addEventListener(type: string, handler: () => void) {
      if (type === 'load') {
        this.loadHandler = handler
      } else if (type === 'error') {
        this.errorHandler = handler
      }
    }

    set src(value: string) {
      void value
      this.loadHandler?.()
    }

    get src(): string {
      return ''
    }
  })

  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:test'),
    revokeObjectURL: vi.fn(),
  })
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })

  return {
    promise,
    resolve,
  }
}

describe('IconEditorDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fromExternalAbsPathMock.mockImplementation((path: string) => `/normalized${path}`)
    vi.mocked(openDialog).mockResolvedValue('/local/icon.png')
    vi.mocked(readFile).mockResolvedValue(new Uint8Array([1, 2, 3]))
    loadIconEditorSourceDataMock.mockResolvedValue(undefined)
    buildIconExportOutputsMock.mockResolvedValue([
      {
        bytes: new Uint8Array([4, 5]),
        relativePath: RelPath.from('icons/favicon.ico'),
      },
    ] satisfies IconExportOutput[])
    saveIconEditorOutputsMock.mockResolvedValue(undefined)
    refreshRegisteredGameSnapshotMock.mockResolvedValue(undefined)
    mockImageLoading()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('默认纯色背景也会显示预览但仍不能生成', async () => {
    renderInBrowser(IconEditorDialog, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
        gamePath: '/games/demo',
      },
      global: {
        stubs: globalStubs,
      },
    })

    expect(document.querySelectorAll('[data-testid="icon-editor-preview-item"]')).toHaveLength(6)
    await expect.element(page.getByTestId('icon-editor-preview-grid')).toBeVisible()
    await expect.element(page.getByTestId('icon-editor-generate-hint')).toBeVisible()
    await expect.element(page.getByTestId('icon-editor-generate')).toBeDisabled()
  })

  it('打开时使用 icon-data 初始化编辑状态', async () => {
    loadIconEditorSourceDataMock.mockResolvedValue({
      backgroundBytes: new Uint8Array([8, 9]),
      foregroundBytes: new Uint8Array([6, 7]),
      state: {
        backgroundColor: '#112233',
        backgroundOffsetRatio: { x: -0.1, y: 0.2 },
        backgroundScale: 1.25,
        backgroundType: 'image',
        foregroundOffsetRatio: { x: 0.3, y: -0.4 },
        foregroundScale: 0.75,
        iconShape: 'circle',
        version: 1,
      },
    })

    renderInBrowser(IconEditorDialog, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
        gamePath: '/games/demo',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await vi.waitFor(() => {
      expect(loadIconEditorSourceDataMock).toHaveBeenCalledWith('/games/demo')
    })
    await expect.element(page.getByTestId('icon-editor-preview-grid')).toBeVisible()
    await expect.element(page.getByTestId('icon-editor-generate')).not.toBeDisabled()

    await page.getByTestId('icon-editor-generate').click()

    await vi.waitFor(() => {
      expect(buildIconExportOutputsMock).toHaveBeenCalledWith(expect.objectContaining({
        backgroundColor: '#112233',
        backgroundImage: expect.objectContaining({
          bytes: new Uint8Array([8, 9]),
        }),
        backgroundOffsetRatio: { x: -0.1, y: 0.2 },
        backgroundScale: 1.25,
        backgroundType: 'image',
        foregroundImage: expect.objectContaining({
          bytes: new Uint8Array([6, 7]),
        }),
        foregroundOffsetRatio: { x: 0.3, y: -0.4 },
        foregroundScale: 0.75,
        iconShape: 'circle',
      }))
    })
  })

  it('关闭后重新打开会回到默认配置且保留默认预览', async () => {
    const result = renderInBrowser(IconEditorDialog, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
        gamePath: '/games/demo',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('icon-editor-select-foreground').click()
    await expect.element(page.getByTestId('icon-editor-preview-grid')).toBeVisible()

    await result.rerender({ open: false })
    await result.rerender({ open: true })

    expect(document.querySelectorAll('[data-testid="icon-editor-preview-item"]')).toHaveLength(6)
    await expect.element(page.getByTestId('icon-editor-preview-grid')).toBeVisible()
    await expect.element(page.getByTestId('icon-editor-generate')).toBeDisabled()
  })

  it('打开期间切换游戏路径时只应用最新的 icon-data', async () => {
    const firstRestore = createDeferred<IconEditorSourceData | undefined>()
    loadIconEditorSourceDataMock
      .mockReturnValueOnce(firstRestore.promise)
      .mockResolvedValueOnce({
        foregroundBytes: new Uint8Array([9, 9]),
        state: {
          backgroundColor: '#445566',
          backgroundOffsetRatio: { x: 0, y: 0 },
          backgroundScale: 1,
          backgroundType: 'color',
          foregroundOffsetRatio: { x: 0.1, y: 0.2 },
          foregroundScale: 1.4,
          iconShape: 'rounded',
          version: 1,
        },
      } satisfies IconEditorSourceData)

    const result = renderInBrowser(IconEditorDialog, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
        gamePath: '/games/old',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await vi.waitFor(() => {
      expect(loadIconEditorSourceDataMock).toHaveBeenCalledWith('/games/old')
    })

    await result.rerender({
      open: true,
      gamePath: '/games/new',
    })

    await vi.waitFor(() => {
      expect(loadIconEditorSourceDataMock).toHaveBeenCalledWith('/games/new')
    })
    await vi.waitFor(() => {
      expect(page.getByTestId('icon-editor-generate').element()).not.toBeDisabled()
    })

    firstRestore.resolve({
      foregroundBytes: new Uint8Array([1, 1]),
      state: {
        backgroundColor: '#112233',
        backgroundOffsetRatio: { x: 0, y: 0 },
        backgroundScale: 1,
        backgroundType: 'color',
        foregroundOffsetRatio: { x: -0.3, y: -0.4 },
        foregroundScale: 0.6,
        iconShape: 'circle',
        version: 1,
      },
    })
    await nextTick()

    await page.getByTestId('icon-editor-generate').click()

    await vi.waitFor(() => {
      expect(buildIconExportOutputsMock).toHaveBeenCalledWith(expect.objectContaining({
        foregroundImage: expect.objectContaining({
          bytes: new Uint8Array([9, 9]),
        }),
        foregroundOffsetRatio: { x: 0.1, y: 0.2 },
        foregroundScale: 1.4,
        iconShape: 'rounded',
      }))
      expect(saveIconEditorOutputsMock).toHaveBeenCalledWith('/games/new', expect.any(Array))
    })
  })

  it('偏移控件以百分比输入并向导出流程传递比例值', async () => {
    renderInBrowser(IconEditorDialog, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
        gamePath: '/games/demo',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('icon-editor-select-foreground').click()

    const offsetInput = document.querySelector<HTMLInputElement>('[data-testid="icon-editor-foreground-offset-x-input"]')
    const offsetUnit = document.querySelector<HTMLElement>('[data-testid="icon-editor-foreground-offset-x-unit"]')

    expect(offsetInput).not.toBeNull()
    expect(offsetInput?.min).toBe('-75')
    expect(offsetInput?.max).toBe('75')
    expect(offsetInput?.step).toBe('1')
    expect(offsetInput?.value).toBe('0')
    expect(offsetUnit?.textContent?.trim()).toBe('%')

    await page.getByTestId('icon-editor-foreground-offset-x-input').fill('25')
    await page.getByTestId('icon-editor-generate').click()

    await vi.waitFor(() => {
      expect(buildIconExportOutputsMock).toHaveBeenCalledWith(expect.objectContaining({
        foregroundOffsetRatio: { x: 0.25, y: 0 },
      }))
    })
  })

  it('缩放控件以百分比输入并向导出流程传递倍率值', async () => {
    renderInBrowser(IconEditorDialog, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
        gamePath: '/games/demo',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('icon-editor-select-foreground').click()

    const scaleInput = document.querySelector<HTMLInputElement>('[data-testid="icon-editor-foreground-scale-input"]')
    const scaleUnit = document.querySelector<HTMLElement>('[data-testid="icon-editor-foreground-scale-unit"]')

    expect(scaleInput).not.toBeNull()
    expect(scaleInput?.min).toBe('25')
    expect(scaleInput?.max).toBe('175')
    expect(scaleInput?.step).toBe('1')
    expect(scaleInput?.value).toBe('100')
    expect(scaleUnit?.textContent?.trim()).toBe('%')

    await page.getByTestId('icon-editor-foreground-scale-input').fill('150')
    await page.getByTestId('icon-editor-generate').click()

    await vi.waitFor(() => {
      expect(buildIconExportOutputsMock).toHaveBeenCalledWith(expect.objectContaining({
        foregroundScale: 1.5,
      }))
    })
  })

  it('拖拽偏移滑条后不会在输入框泄漏浮点误差', async () => {
    renderInBrowser(IconEditorDialog, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
        gamePath: '/games/demo',
      },
      global: {
        stubs: {
          ...globalStubs,
          Slider: createSliderUpdateSequenceStub([[7], [-14]]),
        },
      },
    })

    await page.getByTestId('icon-editor-select-foreground').click()

    await page.getByTestId('icon-editor-foreground-offset-x-slider').click()
    await vi.waitFor(() => {
      const offsetInput = document.querySelector<HTMLInputElement>('[data-testid="icon-editor-foreground-offset-x-input"]')
      expect(offsetInput?.value).toBe('7')
    })

    await page.getByTestId('icon-editor-foreground-offset-y-slider').click()
    await vi.waitFor(() => {
      const offsetInput = document.querySelector<HTMLInputElement>('[data-testid="icon-editor-foreground-offset-y-input"]')
      expect(offsetInput?.value).toBe('-14')
    })
  })

  it('滑条接近中心值时会吸附到中心但数字输入不吸附', async () => {
    renderInBrowser(IconEditorDialog, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
        gamePath: '/games/demo',
      },
      global: {
        stubs: {
          ...globalStubs,
          Slider: createSliderUpdateSequenceStub([[2], [98]]),
        },
      },
    })

    await page.getByTestId('icon-editor-select-foreground').click()

    await page.getByTestId('icon-editor-foreground-offset-x-slider').click()
    await vi.waitFor(() => {
      const offsetInput = document.querySelector<HTMLInputElement>('[data-testid="icon-editor-foreground-offset-x-input"]')
      expect(offsetInput?.value).toBe('0')
    })

    await page.getByTestId('icon-editor-foreground-scale-slider').click()
    await vi.waitFor(() => {
      const scaleInput = document.querySelector<HTMLInputElement>('[data-testid="icon-editor-foreground-scale-input"]')
      expect(scaleInput?.value).toBe('100')
    })

    await page.getByTestId('icon-editor-foreground-offset-x-input').fill('2')
    await page.getByTestId('icon-editor-generate').click()

    await vi.waitFor(() => {
      expect(buildIconExportOutputsMock).toHaveBeenCalledWith(expect.objectContaining({
        foregroundOffsetRatio: { x: 0.02, y: 0 },
      }))
    })
  })

  it('更换前景图时只重置前景图调整', async () => {
    renderInBrowser(IconEditorDialog, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
        gamePath: '/games/demo',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('icon-editor-select-foreground').click()
    await page.getByTestId('icon-editor-foreground-scale-input').fill('150')
    await page.getByTestId('icon-editor-foreground-offset-x-input').fill('25')
    await page.getByTestId('icon-editor-foreground-offset-y-input').fill('-10')

    await page.getByTestId('icon-editor-background-image-tab').click()
    await page.getByTestId('icon-editor-select-background').click()
    await page.getByTestId('icon-editor-background-scale-input').fill('125')
    await page.getByTestId('icon-editor-background-offset-x-input').fill('-20')
    await page.getByTestId('icon-editor-background-offset-y-input').fill('15')

    await page.getByTestId('icon-editor-select-foreground').click()
    await page.getByTestId('icon-editor-generate').click()

    await vi.waitFor(() => {
      expect(buildIconExportOutputsMock).toHaveBeenCalledWith(expect.objectContaining({
        backgroundOffsetRatio: { x: -0.2, y: 0.15 },
        backgroundScale: 1.25,
        foregroundOffsetRatio: { x: 0, y: 0 },
        foregroundScale: 1,
      }))
    })
  })

  it('更换背景图时只重置背景图调整', async () => {
    renderInBrowser(IconEditorDialog, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
        gamePath: '/games/demo',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('icon-editor-select-foreground').click()
    await page.getByTestId('icon-editor-foreground-scale-input').fill('150')
    await page.getByTestId('icon-editor-foreground-offset-x-input').fill('25')
    await page.getByTestId('icon-editor-foreground-offset-y-input').fill('-10')

    await page.getByTestId('icon-editor-background-image-tab').click()
    await page.getByTestId('icon-editor-select-background').click()
    await page.getByTestId('icon-editor-background-scale-input').fill('125')
    await page.getByTestId('icon-editor-background-offset-x-input').fill('-20')
    await page.getByTestId('icon-editor-background-offset-y-input').fill('15')

    await page.getByTestId('icon-editor-select-background').click()
    await page.getByTestId('icon-editor-generate').click()

    await vi.waitFor(() => {
      expect(buildIconExportOutputsMock).toHaveBeenCalledWith(expect.objectContaining({
        backgroundOffsetRatio: { x: 0, y: 0 },
        backgroundScale: 1,
        foregroundOffsetRatio: { x: 0.25, y: -0.1 },
        foregroundScale: 1.5,
      }))
    })
  })

  it('背景颜色选择器的 rgba 结果会写入可渲染的 CSS 颜色', async () => {
    renderInBrowser(IconEditorDialog, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
        gamePath: '/games/demo',
      },
      global: {
        stubs: {
          ...globalStubs,
          ColorPicker: createColorPickerUpdateStub({ rgba: { r: 12, g: 34, b: 56, a: 0.5 } }),
        },
      },
    })

    await page.getByTestId('icon-editor-select-foreground').click()
    await page.getByTestId('icon-editor-background-color-picker').click()
    await page.getByTestId('icon-editor-generate').click()

    await vi.waitFor(() => {
      expect(buildIconExportOutputsMock).toHaveBeenCalledWith(expect.objectContaining({
        backgroundColor: 'rgba(12, 34, 56, 0.5)',
        backgroundType: 'color',
      }))
    })
  })

  it('选择前景图后允许生成并在完成后关闭弹窗', async () => {
    const updateOpen = vi.fn()

    renderInBrowser(IconEditorDialog, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        'gamePath': '/games/demo',
        'onUpdate:open': updateOpen,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByTestId('icon-editor-generate')).toBeDisabled()
    await page.getByTestId('icon-editor-select-foreground').click()
    await expect.element(page.getByTestId('icon-editor-generate')).not.toBeDisabled()
    await expect.element(page.getByTestId('icon-editor-generate-hint')).not.toBeInTheDocument()
    expect(fromExternalAbsPathMock).toHaveBeenCalledWith('/local/icon.png')
    expect(readFileMock).toHaveBeenCalledWith('/normalized/local/icon.png')
    await page.getByTestId('icon-editor-generate').click()

    await vi.waitFor(() => {
      expect(buildIconExportOutputsMock).toHaveBeenCalledTimes(1)
      expect(buildIconExportOutputsMock).toHaveBeenCalledWith(expect.objectContaining({
        iconShape: 'square',
      }))
      expect(saveIconEditorOutputsMock).toHaveBeenCalledWith('/games/demo', [
        {
          bytes: new Uint8Array([4, 5]),
          relativePath: RelPath.from('icons/favicon.ico'),
        },
      ])
      expect(refreshRegisteredGameSnapshotMock).toHaveBeenCalledWith('/games/demo')
      expect(updateOpen).toHaveBeenCalledWith(false)
    })
  })

  it('选择裁剪形状后会参与生成', async () => {
    renderInBrowser(IconEditorDialog, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
        gamePath: '/games/demo',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('icon-editor-select-foreground').click()
    await page.getByTestId('icon-editor-shape-circle-tab').click()
    await page.getByTestId('icon-editor-generate').click()

    await vi.waitFor(() => {
      expect(buildIconExportOutputsMock).toHaveBeenCalledWith(expect.objectContaining({
        iconShape: 'circle',
      }))
    })
  })

  it('选择背景图会切换到图片背景并参与生成', async () => {
    renderInBrowser(IconEditorDialog, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
        gamePath: '/games/demo',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('icon-editor-select-foreground').click()
    await page.getByTestId('icon-editor-background-image-tab').click()
    await page.getByTestId('icon-editor-select-background').click()
    await page.getByTestId('icon-editor-generate').click()

    await vi.waitFor(() => {
      expect(buildIconExportOutputsMock).toHaveBeenCalledWith(expect.objectContaining({
        backgroundImage: expect.objectContaining({
          bytes: new Uint8Array([1, 2, 3]),
        }),
        backgroundType: 'image',
        foregroundImage: expect.objectContaining({
          bytes: new Uint8Array([1, 2, 3]),
        }),
      }))
    })
  })

  it('背景模式切回纯色后会按纯色背景生成', async () => {
    renderInBrowser(IconEditorDialog, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
        gamePath: '/games/demo',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('icon-editor-select-foreground').click()
    await page.getByTestId('icon-editor-background-image-tab').click()
    await page.getByTestId('icon-editor-select-background').click()
    await page.getByTestId('icon-editor-background-color-tab').click()
    await page.getByTestId('icon-editor-generate').click()

    await vi.waitFor(() => {
      expect(buildIconExportOutputsMock).toHaveBeenCalledWith(expect.objectContaining({
        backgroundType: 'color',
        foregroundImage: expect.objectContaining({
          bytes: new Uint8Array([1, 2, 3]),
        }),
      }))
    })
  })

  it('取消系统文件选择时保持生成按钮禁用', async () => {
    vi.mocked(openDialog).mockResolvedValue(undefined)

    renderInBrowser(IconEditorDialog, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
        gamePath: '/games/demo',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('icon-editor-select-foreground').click()

    await expect.element(page.getByTestId('icon-editor-generate')).toBeDisabled()
    expect(buildIconExportOutputsMock).not.toHaveBeenCalled()
  })
})
