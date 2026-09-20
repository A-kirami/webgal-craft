import '~/__tests__/mocks/i18n'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, reactive, ref } from 'vue'

import { createTestTemplate } from '~/__tests__/factories'
import { createTestRenderer } from '~/features/editor/__tests__/utils/createTestRenderer'
import { publishTourCompletion } from '~/features/onboarding/tour-state'
import { TOUR_PERSISTENCE } from '~/features/onboarding/tour-version'

import {
  RESOURCE_SWITCH_ENGINE_MODAL,
  RESOURCE_SWITCH_TEMPLATE_MODAL,
  useResourceSwitchTour,
} from '../useResourceSwitchTour'

import type { TourDriverOptions } from '../tour'
import type { DriverHook, DriveStep } from 'driver.js'
import type { TestNode } from '~/features/editor/__tests__/utils/createTestRenderer'

const {
  cancelAnimationFrameMock,
  createTourDriverMock,
  driverMock,
  requestAnimationFrameMock,
  resourceState,
  useStorageMock,
} = vi.hoisted(() => {
  const driver = {
    destroy: vi.fn(),
    drive: vi.fn(),
    moveNext: vi.fn(),
    movePrevious: vi.fn(),
    refresh: vi.fn(),
  }

  return {
    cancelAnimationFrameMock: vi.fn(),
    createTourDriverMock: vi.fn<(options: TourDriverOptions) => typeof driver>(() => driver),
    driverMock: driver,
    requestAnimationFrameMock: vi.fn<(callback: () => void) => number>(() => 1),
    resourceState: {
      engines: [] as unknown[],
      templates: [] as unknown[],
    },
    useStorageMock: vi.fn<(key: string, initialValue: string) => { value: string }>(),
  }
})

const modalStoreMock = reactive({
  close: vi.fn(),
  hasOpenModal: false,
  open: vi.fn(),
})

const workspaceStoreMock = reactive({
  currentGame: undefined as { engineId?: string, path: string } | undefined,
})

vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vueuse/core')>()

  return { ...actual, useStorage: useStorageMock }
})

vi.mock('~/composables/useDatabase', async () => {
  const { ref: createRef } = await import('vue')

  return {
    useEngines: () => createRef(resourceState.engines),
    useTemplates: () => createRef(resourceState.templates),
  }
})

vi.mock('~/features/onboarding/tour', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/features/onboarding/tour')>()

  return { ...actual, createTourDriver: createTourDriverMock }
})

vi.mock('~/services/engine-manager', () => ({
  isEngineEditorCompatible: () => true,
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: () => modalStoreMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: () => workspaceStoreMock,
}))

type DestroyedHook = NonNullable<TourDriverOptions['onDestroyed']>

const renderer = createTestRenderer()
const mountedApps: { unmount: () => void }[] = []

function lastDriverOptions(): TourDriverOptions {
  const options = createTourDriverMock.mock.calls.at(-1)?.[0]
  if (!options) {
    throw new TypeError('createTourDriver 没有被调用')
  }

  return options
}

/** 真实 driver.js 的 destroy 会同步触发 onDestroyed，mock 保持同样行为 */
function destroyDriver(): void {
  lastDriverOptions().onDestroyed?.(
    undefined,
    {} as DriveStep,
    {} as Parameters<DestroyedHook>[2],
  )
}

function callHook(hook: DriverHook | undefined): void {
  hook?.(undefined, {} as DriveStep, { driver: driverMock } as unknown as Parameters<DriverHook>[2])
}

function findStep(selector: string): DriveStep {
  const step = lastDriverOptions().steps.find(candidate => candidate.element === selector)
  if (!step) {
    throw new TypeError(`引导步骤缺少 ${selector}`)
  }

  return step
}

function mountTour(): void {
  const Harness = defineComponent({
    setup() {
      useResourceSwitchTour()
      return () => undefined
    },
  })

  const container: TestNode = { type: 'root', children: [] }
  const app = renderer.createApp(Harness)
  app.mount(container)
  mountedApps.push(app)
}

beforeEach(() => {
  resourceState.engines = []
  resourceState.templates = []
  modalStoreMock.close.mockReset()
  modalStoreMock.open.mockReset()
  modalStoreMock.hasOpenModal = false
  workspaceStoreMock.currentGame = { engineId: 'engine-1', path: '/games/demo' }
  createTourDriverMock.mockReset()
  createTourDriverMock.mockImplementation(() => driverMock)
  driverMock.destroy.mockReset()
  driverMock.destroy.mockImplementation(destroyDriver)
  driverMock.drive.mockReset()
  driverMock.moveNext.mockReset()
  driverMock.movePrevious.mockReset()
  driverMock.refresh.mockReset()
  cancelAnimationFrameMock.mockReset()
  requestAnimationFrameMock.mockReset()
  requestAnimationFrameMock.mockImplementation(() => 1)
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock)
  vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock)
  useStorageMock.mockReset()
  useStorageMock.mockImplementation((_key: string, initialValue: string) => ref(initialValue))
  publishTourCompletion(TOUR_PERSISTENCE.editorWorkspace.storageKey, TOUR_PERSISTENCE.editorWorkspace.version)
})

afterEach(() => {
  while (mountedApps.length > 0) {
    mountedApps.pop()?.unmount()
  }
})

describe('useResourceSwitchTour', () => {
  it('没有可切换替代项时不启动', async () => {
    mountTour()
    await nextTick()

    expect(createTourDriverMock).not.toHaveBeenCalled()
  })

  it('编辑器工作区引导完成广播到达后才启动', async () => {
    publishTourCompletion(TOUR_PERSISTENCE.editorWorkspace.storageKey, '')
    resourceState.templates = [createTestTemplate()]

    mountTour()
    await nextTick()
    expect(createTourDriverMock).not.toHaveBeenCalled()

    publishTourCompletion(TOUR_PERSISTENCE.editorWorkspace.storageKey, TOUR_PERSISTENCE.editorWorkspace.version)
    await nextTick()

    expect(createTourDriverMock).toHaveBeenCalledTimes(1)
  })

  it('存在可切换替代项时启动三步引导', async () => {
    resourceState.templates = [createTestTemplate()]

    mountTour()
    await nextTick()

    expect(driverMock.drive).toHaveBeenCalledTimes(1)
    expect(lastDriverOptions().steps).toHaveLength(3)
  })

  it('弹窗步骤关闭缺失元素跳过，避免上一步被误判为最后一步', async () => {
    resourceState.templates = [createTestTemplate()]

    mountTour()
    await nextTick()

    expect(findStep('[data-tour="switch-engine-dialog"]').skipMissingElement).toBe(false)
    expect(findStep('[data-tour="switch-template-dialog"]').skipMissingElement).toBe(false)
  })

  it('弹窗步骤高亮时开始跟踪入场动画并刷新高亮', async () => {
    resourceState.templates = [createTestTemplate()]

    mountTour()
    await nextTick()

    callHook(findStep('[data-tour="switch-engine-dialog"]').onHighlighted)

    expect(requestAnimationFrameMock).toHaveBeenCalledTimes(1)

    // 手动跑一帧：动画期间靠 refresh 让高亮跟上弹窗
    requestAnimationFrameMock.mock.calls[0]?.[0]?.()
    expect(driverMock.refresh).toHaveBeenCalledTimes(1)
  })

  it('打开弹窗不销毁引导，弹窗被关掉才按完成收尾', async () => {
    resourceState.templates = [createTestTemplate()]

    mountTour()
    await nextTick()

    callHook(findStep('[data-tour="resource-switch"]').popover?.onNextClick)
    expect(modalStoreMock.open).toHaveBeenCalledWith(RESOURCE_SWITCH_ENGINE_MODAL, expect.anything())

    modalStoreMock.hasOpenModal = true
    await nextTick()
    expect(driverMock.destroy).not.toHaveBeenCalled()

    modalStoreMock.hasOpenModal = false
    await nextTick()
    expect(driverMock.destroy).toHaveBeenCalledTimes(1)
  })

  it('第一步点下一步会立即打开引擎弹窗并前进，不等待动画', async () => {
    resourceState.templates = [createTestTemplate()]

    mountTour()
    await nextTick()

    callHook(findStep('[data-tour="resource-switch"]').popover?.onNextClick)

    expect(modalStoreMock.open).toHaveBeenCalledWith(RESOURCE_SWITCH_ENGINE_MODAL, {
      game: workspaceStoreMock.currentGame,
    })
    expect(driverMock.moveNext).toHaveBeenCalledTimes(1)
  })

  it('第二步点下一步会收回引擎弹窗并打开模板弹窗', async () => {
    resourceState.templates = [createTestTemplate()]

    mountTour()
    await nextTick()

    callHook(findStep('[data-tour="switch-engine-dialog"]').popover?.onNextClick)

    expect(modalStoreMock.close).toHaveBeenCalledWith(RESOURCE_SWITCH_ENGINE_MODAL)
    expect(modalStoreMock.open).toHaveBeenCalledWith(RESOURCE_SWITCH_TEMPLATE_MODAL, expect.anything())
    expect(driverMock.moveNext).toHaveBeenCalledTimes(1)
  })

  it('最后一步返回会重新打开引擎弹窗', async () => {
    resourceState.templates = [createTestTemplate()]

    mountTour()
    await nextTick()

    callHook(findStep('[data-tour="switch-template-dialog"]').popover?.onPrevClick)

    expect(modalStoreMock.open).toHaveBeenCalledWith(RESOURCE_SWITCH_ENGINE_MODAL, expect.anything())
    expect(driverMock.movePrevious).toHaveBeenCalledTimes(1)
  })

  it('销毁时收回自己打开的两个弹窗并停止跟踪', async () => {
    resourceState.templates = [createTestTemplate()]

    mountTour()
    await nextTick()

    callHook(findStep('[data-tour="switch-engine-dialog"]').onHighlighted)
    driverMock.destroy()

    expect(modalStoreMock.close).toHaveBeenCalledWith(RESOURCE_SWITCH_ENGINE_MODAL)
    expect(modalStoreMock.close).toHaveBeenCalledWith(RESOURCE_SWITCH_TEMPLATE_MODAL)
    expect(cancelAnimationFrameMock).toHaveBeenCalled()
  })
})
