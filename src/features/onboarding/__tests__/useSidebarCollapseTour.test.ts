import '~/__tests__/mocks/i18n'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, reactive, ref } from 'vue'

import { createTestRenderer } from '~/features/editor/__tests__/utils/createTestRenderer'

import { TOUR_LAYOUT_SETTLE_DELAY_MS } from '../tour'
import { createSidebarCollapseTourSteps, useSidebarCollapseTour } from '../useSidebarCollapseTour'

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

const preferenceStoreMock = reactive({
  editorMode: 'text' as 'text' | 'visual',
  showSidebar: false,
})
const editorStoreMock = reactive({ isCurrentSceneFile: true })
const editSettingsMock = reactive({ collapseStatementsOnSidebarOpen: true })
// useOnboardingTour 读 hasOpenModal，同时避免在 node 环境加载 stores/modal 拉起的全部弹窗组件
const modalStoreMock = reactive({ hasOpenModal: false })

vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vueuse/core')>()

  return { ...actual, useStorage: (_key: string, initialValue: string) => ref(initialValue) }
})

vi.mock('~/features/onboarding/tour', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/features/onboarding/tour')>()

  return { ...actual, createTourDriver: createTourDriverMock }
})

vi.mock('~/stores/edit-settings', () => ({
  useEditSettingsStore: () => editSettingsMock,
}))

vi.mock('~/stores/editor', () => ({
  useEditorStore: () => editorStoreMock,
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: () => modalStoreMock,
}))

vi.mock('~/stores/preference', () => ({
  usePreferenceStore: () => preferenceStoreMock,
}))

const renderer = createTestRenderer()
const mountedApps: { unmount: () => void }[] = []

function mountSidebarCollapseTour(): void {
  const Harness = defineComponent({
    setup() {
      useSidebarCollapseTour()
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

/** 越过提示延时 */
async function settleNotice(): Promise<void> {
  await nextTick()
  await vi.advanceTimersByTimeAsync(TOUR_LAYOUT_SETTLE_DELAY_MS)
  await nextTick()
}

/** 打开辅助面板并越过提示延时 */
async function openSidebar(): Promise<void> {
  preferenceStoreMock.showSidebar = true
  await nextTick()
  await settleNotice()
}

beforeEach(() => {
  vi.useFakeTimers()
  preferenceStoreMock.editorMode = 'visual'
  preferenceStoreMock.showSidebar = false
  editorStoreMock.isCurrentSceneFile = true
  editSettingsMock.collapseStatementsOnSidebarOpen = true
  modalStoreMock.hasOpenModal = false
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

describe('createSidebarCollapseTourSteps', () => {
  it('只高亮编辑区一步，且只给一个确认按钮', () => {
    const echoT = ((key: string) => key) as unknown as I18nT

    const steps = createSidebarCollapseTourSteps(echoT)

    expect(steps.map(step => step.element)).toEqual(['[data-tour="editor-area"]'])
    expect(steps[0]?.popover?.showButtons).toEqual(['next'])
    expect(steps[0]?.popover?.doneBtnText).toBe('tour.common.gotIt')
  })
})

describe('useSidebarCollapseTour', () => {
  it('可视化模式下打开辅助面板后弹出折叠说明', async () => {
    mountSidebarCollapseTour()
    await openSidebar()

    expect(driverMock.drive).toHaveBeenCalledTimes(1)
    expect(lastDriverOptions().steps).toHaveLength(1)
  })

  it('状态本来就停在可视化加已开面板时也会补上提示', async () => {
    preferenceStoreMock.showSidebar = true

    mountSidebarCollapseTour()
    await settleNotice()

    expect(driverMock.drive).toHaveBeenCalledTimes(1)
  })

  it('文本模式下打开辅助面板不弹提示', async () => {
    preferenceStoreMock.editorMode = 'text'

    mountSidebarCollapseTour()
    await openSidebar()

    expect(createTourDriverMock).not.toHaveBeenCalled()
  })

  it('已经关掉折叠语句时打开辅助面板不弹提示', async () => {
    editSettingsMock.collapseStatementsOnSidebarOpen = false

    mountSidebarCollapseTour()
    await openSidebar()

    expect(createTourDriverMock).not.toHaveBeenCalled()
  })
})
