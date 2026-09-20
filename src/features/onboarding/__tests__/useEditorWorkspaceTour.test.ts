import '~/__tests__/mocks/i18n'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, reactive, ref } from 'vue'

import { createTestRenderer } from '~/features/editor/__tests__/utils/createTestRenderer'

import { TOUR_LAYOUT_SETTLE_DELAY_MS } from '../tour'
import { createEditorWorkspaceTourSteps, useEditorWorkspaceTour } from '../useEditorWorkspaceTour'

import type { TourDriverOptions } from '../tour'
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

function mountEditorWorkspaceTour(): void {
  const Harness = defineComponent({
    setup() {
      useEditorWorkspaceTour({ expandCommandPanel: expandCommandPanelMock })
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

/** 打开场景文件并等待布局稳定，走完 useEditorWorkspaceTour 的启动路径 */
async function openSceneFile(): Promise<void> {
  editorStoreMock.isCurrentSceneFile = true
  await nextTick()
  await nextTick()
  await vi.advanceTimersByTimeAsync(TOUR_LAYOUT_SETTLE_DELAY_MS)
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
})

afterEach(() => {
  vi.useRealTimers()
  while (mountedApps.length > 0) {
    mountedApps.pop()?.unmount()
  }
})

describe('createEditorWorkspaceTourSteps', () => {
  it('依次指向模式切换、编辑区与命令面板', () => {
    const echoT = ((key: string) => key) as unknown as I18nT

    const steps = createEditorWorkspaceTourSteps(echoT)

    expect(steps.map(step => step.element)).toEqual([
      '[data-tour="mode-switch"]',
      '[data-tour="editor-area"]',
      '[data-tour="command-panel"]',
    ])
    // 首步没有可返回的上一步，只保留「下一步 / 跳过」
    expect(steps[0]?.popover?.showButtons).toEqual(['next', 'close'])
  })

  it('模式切换步骤不做点击演示，用户只能按「下一步」继续', () => {
    const echoT = ((key: string) => key) as unknown as I18nT

    const modeStep = createEditorWorkspaceTourSteps(echoT)[0]

    // 其余步骤都屏蔽交互，这一步保持同样行为，避免用户以为引导里可以操作
    expect(modeStep?.disableActiveInteraction).toBeUndefined()
    expect(modeStep?.onHighlightStarted).toBeUndefined()
    expect(modeStep?.onDeselected).toBeUndefined()
  })
})

describe('useEditorWorkspaceTour', () => {
  it('编辑器还没有打开场景文件时不启动引导', async () => {
    mountEditorWorkspaceTour()
    await nextTick()
    await vi.advanceTimersByTimeAsync(TOUR_LAYOUT_SETTLE_DELAY_MS)

    expect(createTourDriverMock).not.toHaveBeenCalled()
  })

  it('打开场景文件后展开命令面板，等布局稳定再启动引导', async () => {
    mountEditorWorkspaceTour()
    await openSceneFile()

    expect(expandCommandPanelMock).toHaveBeenCalledTimes(1)
    expect(driverMock.drive).toHaveBeenCalledTimes(1)
    expect(lastDriverOptions().steps).toHaveLength(3)
  })
})
