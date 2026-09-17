import '~/__tests__/mocks/i18n'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, reactive, ref } from 'vue'

import { createTestRenderer } from '~/features/editor/__tests__/utils/createTestRenderer'

import { createHomeTourSteps, useHomeTour } from '../useHomeTour'

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

const modalStoreMock = reactive({ hasOpenModal: false })
const workspaceStoreMock = reactive({ activeTab: 'recent' })

vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vueuse/core')>()

  return { ...actual, useStorage: (_key: string, initialValue: string) => ref(initialValue) }
})

vi.mock('~/features/onboarding/tour', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/features/onboarding/tour')>()

  return { ...actual, createTourDriver: createTourDriverMock }
})

vi.mock('~/stores/modal', () => ({
  useModalStore: () => modalStoreMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: () => workspaceStoreMock,
}))

const renderer = createTestRenderer()
const mountedApps: { unmount: () => void }[] = []
const isPageReady = ref(true)

function mountHomeTour(): void {
  const Harness = defineComponent({
    setup() {
      useHomeTour({ isPageReady: () => isPageReady.value })
      return () => undefined
    },
  })

  const container: TestNode = { type: 'root', children: [] }
  const app = renderer.createApp(Harness)
  app.mount(container)
  mountedApps.push(app)
}

beforeEach(() => {
  isPageReady.value = true
  modalStoreMock.hasOpenModal = false
  workspaceStoreMock.activeTab = 'recent'
  createTourDriverMock.mockReset()
  createTourDriverMock.mockImplementation(() => driverMock)
  driverMock.drive.mockReset()
})

afterEach(() => {
  while (mountedApps.length > 0) {
    mountedApps.pop()?.unmount()
  }
})

describe('createHomeTourSteps', () => {
  it('从居中欢迎页开始，依次指向创建和导入入口', () => {
    const echoT = ((key: string) => key) as unknown as I18nT

    const steps = createHomeTourSteps(echoT)

    expect(steps.map(step => step.element)).toEqual([
      undefined,
      '[data-tour="create-game"]',
      '[data-tour="import-game"]',
    ])
    expect(steps[0]?.popover).toEqual({
      description: 'tour.home.welcome.description',
      showButtons: ['next', 'close'],
      title: 'tour.home.welcome.title',
    })
  })
})

describe('useHomeTour', () => {
  it('首页首次发现未结束时不启动引导，结束后才启动', async () => {
    isPageReady.value = false

    mountHomeTour()
    await nextTick()

    expect(createTourDriverMock).not.toHaveBeenCalled()

    isPageReady.value = true
    await nextTick()

    expect(driverMock.drive).toHaveBeenCalledTimes(1)
  })

  it('离开游戏 Tab 时不启动引导，切回后启动', async () => {
    workspaceStoreMock.activeTab = 'engines'

    mountHomeTour()
    await nextTick()

    expect(createTourDriverMock).not.toHaveBeenCalled()

    workspaceStoreMock.activeTab = 'recent'
    await nextTick()

    expect(driverMock.drive).toHaveBeenCalledTimes(1)
  })
})
