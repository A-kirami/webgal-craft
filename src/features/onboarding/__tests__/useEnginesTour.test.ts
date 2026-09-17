import '~/__tests__/mocks/i18n'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, reactive, ref } from 'vue'

import { createTestRenderer } from '~/features/editor/__tests__/utils/createTestRenderer'

import { createEnginesTourSteps, useEnginesTour } from '../useEnginesTour'

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

function mountEnginesTour(): void {
  const Harness = defineComponent({
    setup() {
      useEnginesTour()
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

beforeEach(() => {
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

describe('createEnginesTourSteps', () => {
  it('依次指向官方引擎卡片和自定义引擎导入入口', () => {
    const echoT = ((key: string) => key) as unknown as I18nT

    const steps = createEnginesTourSteps(echoT)

    expect(steps.map(step => step.element)).toEqual([
      '[data-tour="official-engine"]',
      '[data-tour="custom-engine-import"]',
    ])
    expect(steps[0]?.popover).toEqual({
      description: 'tour.engines.official.description',
      showButtons: ['next', 'close'],
      title: 'tour.engines.official.title',
    })
  })
})

describe('useEnginesTour', () => {
  it('切换到引擎 Tab 时启动引导，遮罩行为沿用共享配置', async () => {
    mountEnginesTour()
    await nextTick()

    expect(createTourDriverMock).not.toHaveBeenCalled()

    workspaceStoreMock.activeTab = 'engines'
    await nextTick()

    expect(driverMock.drive).toHaveBeenCalledTimes(1)
    expect(lastDriverOptions().overrides).toBeUndefined()
  })
})
