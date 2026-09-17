import '~/__tests__/mocks/i18n'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, reactive, ref } from 'vue'

import { createTestRenderer } from '~/features/editor/__tests__/utils/createTestRenderer'
import { usePreferenceStore } from '~/stores/preference'

import { createEditorTourSteps, EDITOR_TOUR_LAYOUT_SETTLE_DELAY_MS, useEditorTour } from '../useEditorTour'

import type { TourDriverOptions } from '../tour'
import type { DriverHook, DriveStep } from 'driver.js'
import type { TestNode } from '~/features/editor/__tests__/utils/createTestRenderer'
import type { I18nT } from '~/utils/i18n-like'

const { createTourDriverMock, driverMock } = vi.hoisted(() => {
  const driver = {
    destroy: vi.fn(),
    drive: vi.fn(),
    moveNext: vi.fn(),
  }

  return {
    createTourDriverMock: vi.fn<(options: TourDriverOptions) => typeof driver>(() => driver),
    driverMock: driver,
  }
})

const editorStoreMock = reactive({ isCurrentSceneFile: false })
const modalStoreMock = reactive({ hasOpenModal: false })

vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vueuse/core')>()

  return { ...actual, useStorage: (_key: string, initialValue: string) => ref(initialValue) }
})

vi.mock('~/features/onboarding/tour', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/features/onboarding/tour')>()

  return { ...actual, createTourDriver: createTourDriverMock }
})

vi.mock('~/stores/editor', () => ({
  useEditorStore: () => editorStoreMock,
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: () => modalStoreMock,
}))

const renderer = createTestRenderer()
const mountedApps: { unmount: () => void }[] = []
const expandCommandPanelMock = vi.fn()

function callHook(hook: DriverHook | undefined): void {
  hook?.(undefined, {} as DriveStep, {} as Parameters<DriverHook>[2])
}

function mountEditorTour(): void {
  const Harness = defineComponent({
    setup() {
      useEditorTour({ expandCommandPanel: expandCommandPanelMock })
      return () => undefined
    },
  })

  const container: TestNode = { type: 'root', children: [] }
  const app = renderer.createApp(Harness)
  app.mount(container)
  mountedApps.push(app)
}

function lastDriverOptions(): TourDriverOptions {
  const options = createTourDriverMock.mock.calls.at(-1)?.[0]
  if (!options) {
    throw new TypeError('createTourDriver 没有被调用')
  }

  return options
}

function findStep(selector: string): DriveStep {
  const step = lastDriverOptions().steps.find(candidate => candidate.element === selector)
  if (!step) {
    throw new TypeError(`引导步骤缺少 ${selector}`)
  }

  return step
}

/** 打开场景文件并等待布局稳定，走完 useEditorTour 的启动路径 */
async function openSceneFile(): Promise<void> {
  editorStoreMock.isCurrentSceneFile = true
  await nextTick()
  await nextTick()
  await vi.advanceTimersByTimeAsync(EDITOR_TOUR_LAYOUT_SETTLE_DELAY_MS)
  await nextTick()
}

beforeEach(() => {
  vi.useFakeTimers()
  editorStoreMock.isCurrentSceneFile = false
  modalStoreMock.hasOpenModal = false
  expandCommandPanelMock.mockReset()
  createTourDriverMock.mockReset()
  createTourDriverMock.mockImplementation(() => driverMock)
  driverMock.drive.mockReset()
  driverMock.moveNext.mockReset()

  const preferenceStore = usePreferenceStore()
  preferenceStore.editorMode = 'text'
  preferenceStore.showPreviewPanel = true
})

afterEach(() => {
  vi.useRealTimers()
  while (mountedApps.length > 0) {
    mountedApps.pop()?.unmount()
  }
})

describe('createEditorTourSteps', () => {
  const hooks = {
    onModeSwitchDeselected: vi.fn(),
    onModeSwitchHighlighted: vi.fn(),
  }

  it('依次指向预览面板、场景资源、编辑模式、编辑区和命令面板', () => {
    const echoT = ((key: string) => key) as unknown as I18nT

    const steps = createEditorTourSteps(echoT, hooks)

    // 编辑区紧跟模式切换：用户切换后自动前进的落点，必须是刚刚发生变化的那块区域
    expect(steps.map(step => step.element)).toEqual([
      '[data-tour="preview-panel"]',
      '[data-tour="scene-resource-panel"]',
      '[data-tour="mode-switch"]',
      '[data-tour="editor-area"]',
      '[data-tour="command-panel"]',
    ])
    expect(steps[0]?.popover?.showButtons).toEqual(['next', 'close'])
  })

  it('模式切换步骤保留点击高亮按钮自动前进，同时保留「下一步」兜底', () => {
    const echoT = ((key: string) => key) as unknown as I18nT

    const modeStep = createEditorTourSteps(echoT, hooks)[2]

    // 不覆盖 showButtons，即沿用配置里的「下一步 / 上一步 / 跳过」，
    // 避免模式切换按钮不可用时用户只能退回上一步
    expect(modeStep?.popover?.showButtons).toBeUndefined()
    // 全局默认屏蔽高亮区域交互，这一步要靠真实点击自动前进，必须放开
    expect(modeStep?.disableActiveInteraction).toBe(false)
    expect(modeStep?.onHighlightStarted).toBe(hooks.onModeSwitchHighlighted)
    expect(modeStep?.onDeselected).toBe(hooks.onModeSwitchDeselected)
  })
})

describe('useEditorTour', () => {
  it('编辑器还没有打开场景文件时不启动引导', async () => {
    mountEditorTour()
    await nextTick()
    await vi.advanceTimersByTimeAsync(EDITOR_TOUR_LAYOUT_SETTLE_DELAY_MS)

    expect(createTourDriverMock).not.toHaveBeenCalled()
  })

  it('打开场景文件后展开被收起的面板，等布局稳定再启动引导', async () => {
    const preferenceStore = usePreferenceStore()
    preferenceStore.showPreviewPanel = false

    mountEditorTour()
    await openSceneFile()

    expect(preferenceStore.showPreviewPanel).toBe(true)
    expect(expandCommandPanelMock).toHaveBeenCalledTimes(1)
    expect(driverMock.drive).toHaveBeenCalledTimes(1)
    expect(lastDriverOptions().steps).toHaveLength(5)
  })

  it('用户在模式切换步骤切换编辑模式后自动进入下一步', async () => {
    const preferenceStore = usePreferenceStore()

    mountEditorTour()
    await openSceneFile()

    const modeStep = findStep('[data-tour="mode-switch"]')
    callHook(modeStep.onHighlightStarted)
    expect(driverMock.moveNext).not.toHaveBeenCalled()

    preferenceStore.editorMode = 'visual'
    await nextTick()

    expect(driverMock.moveNext).toHaveBeenCalledTimes(1)
  })

  it('离开模式切换步骤后不再跟随编辑模式变化', async () => {
    const preferenceStore = usePreferenceStore()

    mountEditorTour()
    await openSceneFile()

    const modeStep = findStep('[data-tour="mode-switch"]')
    callHook(modeStep.onHighlightStarted)
    callHook(modeStep.onDeselected)

    preferenceStore.editorMode = 'visual'
    await nextTick()

    expect(driverMock.moveNext).not.toHaveBeenCalled()
  })
})
