import '~/__tests__/mocks/i18n'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, reactive, ref } from 'vue'

import { createTestRenderer } from '~/features/editor/__tests__/utils/createTestRenderer'

import { TOUR_PERSISTENCE } from '../tour-version'
import { useEffectEditorTour } from '../useEffectEditorTour'

import type { TourDriverOptions } from '../tour'
import type { DriveStep } from 'driver.js'
import type { TestNode } from '~/features/editor/__tests__/utils/createTestRenderer'

const { createTourDriverMock, driverMock, useStorageMock } = vi.hoisted(() => {
  const driver = {
    destroy: vi.fn(),
    drive: vi.fn(),
    moveNext: vi.fn(),
  }

  return {
    createTourDriverMock: vi.fn<(options: TourDriverOptions) => typeof driver>(() => driver),
    driverMock: driver,
    useStorageMock: vi.fn<(key: string, initialValue: string) => { value: string }>(),
  }
})

const modalStoreMock = reactive({ hasOpenModal: false })

vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vueuse/core')>()

  return { ...actual, useStorage: useStorageMock }
})

vi.mock('~/features/onboarding/tour', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/features/onboarding/tour')>()

  return { ...actual, createTourDriver: createTourDriverMock }
})

vi.mock('~/stores/modal', () => ({
  useModalStore: () => modalStoreMock,
}))

type DestroyedHook = NonNullable<TourDriverOptions['onDestroyed']>

const renderer = createTestRenderer()
const mountedApps: { unmount: () => void }[] = []
const overlayEnabled = ref(false)
const hasInteracted = ref(false)

function mountEffectEditorTour(): void {
  const Harness = defineComponent({
    setup() {
      useEffectEditorTour({
        enabled: () => overlayEnabled.value,
        hasInteracted: () => hasInteracted.value,
      })
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

/** 真实 driver.js 的 destroy 会同步触发 onDestroyed，mock 保持同样行为 */
function destroyDriver(): void {
  lastDriverOptions().onDestroyed?.(
    undefined,
    {} as DriveStep,
    {} as Parameters<DestroyedHook>[2],
  )
}

beforeEach(() => {
  overlayEnabled.value = false
  hasInteracted.value = false
  modalStoreMock.hasOpenModal = false
  createTourDriverMock.mockReset()
  createTourDriverMock.mockImplementation(() => driverMock)
  driverMock.destroy.mockReset()
  driverMock.destroy.mockImplementation(destroyDriver)
  driverMock.drive.mockReset()
  useStorageMock.mockReset()
  useStorageMock.mockImplementation((_key: string, initialValue: string) => ref(initialValue))
})

afterEach(() => {
  while (mountedApps.length > 0) {
    mountedApps.pop()?.unmount()
  }
})

describe('useEffectEditorTour', () => {
  it('变换浮层激活时立即启动，依次高亮效果编辑器落点和预览面板', async () => {
    mountEffectEditorTour()

    overlayEnabled.value = true
    await nextTick()

    expect(driverMock.drive).toHaveBeenCalledTimes(1)
    // 测试环境没有 DOM，Sheet 落点锚点创建失败，回退到直接选中效果编辑器
    expect(lastDriverOptions().steps).toEqual([
      {
        element: '[data-tour="effect-editor"]',
        popover: {
          description: 'tour.effectEditor.panel.description',
          showButtons: ['next', 'close'],
          title: 'tour.effectEditor.panel.title',
        },
      },
      {
        element: '[data-tour="preview-panel"]',
        disableActiveInteraction: false,
        popover: {
          description: 'tour.effectEditor.previewDrag.description',
          title: 'tour.effectEditor.previewDrag.title',
        },
      },
    ])
    // 情境引导只收紧淡入；遮罩点击行为沿用共享配置，不接受逐引导覆盖
    expect(lastDriverOptions().overrides).toEqual({ duration: 150 })
  })

  it('变换浮层未激活时不启动引导', async () => {
    mountEffectEditorTour()
    await nextTick()

    expect(createTourDriverMock).not.toHaveBeenCalled()
  })

  it('用户首次拖拽后引导自动消失并记为完成', async () => {
    const completedVersion = ref('')
    useStorageMock.mockImplementation(() => completedVersion)

    mountEffectEditorTour()
    overlayEnabled.value = true
    await nextTick()
    expect(driverMock.drive).toHaveBeenCalledTimes(1)

    hasInteracted.value = true
    await nextTick()

    expect(driverMock.destroy).toHaveBeenCalledTimes(1)
    expect(completedVersion.value).toBe(TOUR_PERSISTENCE.effectEditor.version)
  })
})
