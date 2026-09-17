import '~/__tests__/mocks/i18n'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, reactive, ref } from 'vue'

import { createTestRenderer } from '~/features/editor/__tests__/utils/createTestRenderer'

import { useOnboardingTour } from '../useOnboardingTour'

import type { TourDriverOptions } from '../tour'
import type { OnboardingTourControls, UseOnboardingTourOptions } from '../useOnboardingTour'
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

const PERSISTENCE = { storageKey: 'tour-test-version', version: '1' } as const

const renderer = createTestRenderer()
const mountedApps: { unmount: () => void }[] = []
const isReady = ref(false)

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

function mountTour(
  overrides: Partial<UseOnboardingTourOptions> = {},
): OnboardingTourControls {
  let controls!: OnboardingTourControls
  const Harness = defineComponent({
    setup() {
      controls = useOnboardingTour({
        persistence: PERSISTENCE,
        ready: () => isReady.value,
        steps: () => [{ popover: { description: 'description', title: 'title' } }],
        ...overrides,
      })
      return () => undefined
    },
  })

  const container: TestNode = { type: 'root', children: [] }
  const app = renderer.createApp(Harness)
  app.mount(container)
  mountedApps.push(app)
  return controls
}

beforeEach(() => {
  isReady.value = false
  modalStoreMock.hasOpenModal = false
  createTourDriverMock.mockReset()
  createTourDriverMock.mockImplementation(() => driverMock)
  driverMock.destroy.mockReset()
  driverMock.destroy.mockImplementation(destroyDriver)
  driverMock.drive.mockReset()
  driverMock.moveNext.mockReset()
  useStorageMock.mockReset()
  useStorageMock.mockImplementation((_key: string, initialValue: string) => ref(initialValue))
})

afterEach(() => {
  while (mountedApps.length > 0) {
    mountedApps.pop()?.unmount()
  }
})

describe('useOnboardingTour', () => {
  it('就绪时启动引导并挂上版本持久化', async () => {
    mountTour()

    isReady.value = true
    await nextTick()

    expect(useStorageMock).toHaveBeenCalledWith(PERSISTENCE.storageKey, '')
    expect(driverMock.drive).toHaveBeenCalledTimes(1)
    expect(lastDriverOptions().steps).toHaveLength(1)
    expect(lastDriverOptions().labels.skip).toBe('tour.common.skip')
  })

  it('未就绪时不启动引导', async () => {
    mountTour()
    await nextTick()

    expect(createTourDriverMock).not.toHaveBeenCalled()
  })

  it('完成或跳过后写入当前版本', async () => {
    const completedVersion = ref('')
    useStorageMock.mockImplementation(() => completedVersion)

    mountTour()
    isReady.value = true
    await nextTick()

    driverMock.destroy()

    expect(completedVersion.value).toBe(PERSISTENCE.version)
  })

  it('已完成当前版本时不再启动引导', async () => {
    useStorageMock.mockImplementation(() => ref(PERSISTENCE.version))

    mountTour()
    isReady.value = true
    await nextTick()

    expect(createTourDriverMock).not.toHaveBeenCalled()
  })

  it('引导升版本后对已完成旧版本的用户重新触发', async () => {
    useStorageMock.mockImplementation(() => ref('0'))

    mountTour()
    isReady.value = true
    await nextTick()

    expect(driverMock.drive).toHaveBeenCalledTimes(1)
  })

  it('条件消失时让位且不写入版本，恢复后重新开始', async () => {
    const completedVersion = ref('')
    useStorageMock.mockImplementation(() => completedVersion)

    mountTour()
    isReady.value = true
    await nextTick()
    expect(driverMock.drive).toHaveBeenCalledTimes(1)

    isReady.value = false
    await nextTick()

    expect(driverMock.destroy).toHaveBeenCalledTimes(1)
    expect(completedVersion.value).toBe('')

    isReady.value = true
    await nextTick()

    expect(driverMock.drive).toHaveBeenCalledTimes(2)
  })

  it('卸载导致的销毁不写入版本', async () => {
    const completedVersion = ref('')
    useStorageMock.mockImplementation(() => completedVersion)

    mountTour()
    isReady.value = true
    await nextTick()
    mountedApps.pop()?.unmount()

    expect(driverMock.destroy).toHaveBeenCalledTimes(1)
    expect(completedVersion.value).toBe('')
  })

  it('弹窗打开时不启动引导，弹窗关闭后才启动', async () => {
    modalStoreMock.hasOpenModal = true

    mountTour()
    isReady.value = true
    await nextTick()

    expect(createTourDriverMock).not.toHaveBeenCalled()

    modalStoreMock.hasOpenModal = false
    await nextTick()

    expect(driverMock.drive).toHaveBeenCalledTimes(1)
  })

  it('引导进行中出现弹窗时立即让位且不写入版本，弹窗关闭后重新开始', async () => {
    const completedVersion = ref('')
    useStorageMock.mockImplementation(() => completedVersion)

    mountTour()
    isReady.value = true
    await nextTick()
    expect(driverMock.drive).toHaveBeenCalledTimes(1)

    modalStoreMock.hasOpenModal = true
    await nextTick()

    expect(driverMock.destroy).toHaveBeenCalledTimes(1)
    expect(completedVersion.value).toBe('')

    modalStoreMock.hasOpenModal = false
    await nextTick()

    expect(driverMock.drive).toHaveBeenCalledTimes(2)
  })

  it('prepare 期间条件失效时不下场，恢复后才启动', async () => {
    mountTour({
      prepare: async () => {
        await nextTick()
      },
    })

    isReady.value = true
    await nextTick()
    isReady.value = false
    await nextTick()
    await nextTick()

    expect(createTourDriverMock).not.toHaveBeenCalled()

    isReady.value = true
    await vi.waitFor(() => {
      expect(driverMock.drive).toHaveBeenCalledTimes(1)
    })
  })

  it('complete 销毁进行中的引导并记为完成', async () => {
    const completedVersion = ref('')
    useStorageMock.mockImplementation(() => completedVersion)

    const tour = mountTour()
    isReady.value = true
    await nextTick()

    tour.complete()

    expect(driverMock.destroy).toHaveBeenCalledTimes(1)
    expect(completedVersion.value).toBe(PERSISTENCE.version)
  })

  it('驱动销毁后执行额外的清理回调', async () => {
    const onDriverDestroyed = vi.fn()
    mountTour({ onDriverDestroyed })

    isReady.value = true
    await nextTick()
    driverMock.destroy()

    expect(onDriverDestroyed).toHaveBeenCalledTimes(1)
  })

  it('步骤钩子通过控制面推进当前引导', async () => {
    mountTour({
      steps: (_t, controls) => [
        {
          onHighlightStarted: () => controls.moveNext(),
          popover: { description: 'description', title: 'title' },
        },
      ],
    })

    isReady.value = true
    await nextTick()

    const step = lastDriverOptions().steps[0]
    step?.onHighlightStarted?.(undefined, {} as DriveStep, {} as Parameters<DestroyedHook>[2])

    expect(driverMock.moveNext).toHaveBeenCalledTimes(1)
  })
})
