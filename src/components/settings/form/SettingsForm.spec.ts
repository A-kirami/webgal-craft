import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, nextTick, reactive } from 'vue'

import { createBrowserCheckboxStub, createBrowserClickStub, createBrowserInputStub, renderInBrowser } from '~/__tests__/browser-render'
import { defineSettingsSchema } from '~/features/settings/schema'

const { openDialogMock } = vi.hoisted(() => ({
  openDialogMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openDialogMock,
}))

import SettingsForm from './SettingsForm.vue'

function createSettingsStore<TState extends Record<string, unknown>>(initialState: TState) {
  const state = reactive({ ...initialState }) as TState

  return {
    $patch(values: Partial<TState>) {
      Object.assign(state, values)
    },
    $state: state,
  }
}

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  ExperimentalFeatureTooltip: defineComponent({
    name: 'StubExperimentalFeatureTooltip',
    setup() {
      return () => h('span', { 'data-testid': 'experimental-badge' }, 'experimental')
    },
  }),
  Input: createBrowserInputStub('StubInput'),
  Switch: createBrowserCheckboxStub('StubSwitch'),
}

const settingsDefinition = defineSettingsSchema({
  general: {
    label: '常规',
    fields: {
      advancedMode: {
        type: 'switch',
        default: false,
        label: '高级模式',
        description: '开启后显示更多设置',
        immediate: true,
      },
      experimentalMode: {
        type: 'switch',
        default: false,
        experimental: true,
        label: '实验开关',
        description: '仅用于测试可见性',
        immediate: true,
        visibleWhen: 'advancedMode',
      },
      projectPath: {
        type: 'folderPicker',
        default: '',
        buttonLabel: '浏览',
        dialogTitle: '选择项目路径',
        label: '项目路径',
        immediate: true,
      },
    },
  },
} as const)

function renderSettingsFormHarness() {
  const store = createSettingsStore(settingsDefinition.defaults)

  const Harness = defineComponent({
    name: 'SettingsFormHarness',
    setup() {
      return () => h('div', [
        h(SettingsForm, {
          definition: settingsDefinition,
          store: store as never,
        }),
        h('output', { 'data-testid': 'advanced-probe' }, String(store.$state.advancedMode)),
        h('output', { 'data-testid': 'path-probe' }, String(store.$state.projectPath)),
      ])
    },
  })

  const result = renderInBrowser(Harness, {
    browser: { i18nMode: 'lite' },
    global: {
      stubs: globalStubs,
    },
  })

  return {
    ...result,
    store,
  }
}

describe('SettingsForm', () => {
  beforeEach(() => {
    openDialogMock.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('根据 visibleWhen 切换字段可见性，并为实验性字段渲染标记', async () => {
    const result = renderSettingsFormHarness()
    const experimentalLabel = page.getByText('实验开关')

    await expect.element(page.getByText('常规')).toBeInTheDocument()
    await expect.element(page.getByText('高级模式')).toBeInTheDocument()
    await expect.element(experimentalLabel).not.toBeVisible()

    await page.getByRole('checkbox').click()
    await nextTick()

    await expect.element(experimentalLabel).toBeVisible()
    await expect.element(page.getByTestId('experimental-badge')).toBeInTheDocument()
    await expect.element(page.getByTestId('advanced-probe')).toHaveTextContent('true')

    await result.unmount()
  })

  it('folderPicker 字段会打开目录选择器，并在选择后更新表单与 store', async () => {
    openDialogMock.mockResolvedValue('/demo/project')
    const result = renderSettingsFormHarness()

    await page.getByRole('button', { name: '浏览' }).click()
    await nextTick()

    expect(openDialogMock).toHaveBeenCalledWith({
      title: '选择项目路径',
      directory: true,
      multiple: false,
      defaultPath: undefined,
    })
    await expect.element(page.getByTestId('path-probe')).toHaveTextContent('/demo/project')

    openDialogMock.mockResolvedValue('/demo/project-next')
    await page.getByRole('button', { name: '浏览' }).click()
    await nextTick()

    expect(openDialogMock).toHaveBeenLastCalledWith({
      title: '选择项目路径',
      directory: true,
      multiple: false,
      defaultPath: '/demo/project',
    })
    await expect.element(page.getByTestId('path-probe')).toHaveTextContent('/demo/project-next')

    await result.unmount()
  })
})
