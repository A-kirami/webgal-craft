import { useForm } from 'vee-validate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, nextTick, onMounted, reactive } from 'vue'
import { z } from 'zod'

import { createBrowserCheckboxStub, createBrowserClickStub, createBrowserContainerStub, createBrowserInputStub, renderInBrowser } from '~/__tests__/browser-render'
import { FormField } from '~/components/ui/form'
import { defineSettingsSchema } from '~/features/settings/schema'

const { isAndroidRuntimeMock, openDialogMock } = vi.hoisted(() => ({
  isAndroidRuntimeMock: vi.fn(),
  openDialogMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openDialogMock,
}))

vi.mock('~/services/platform/runtime', () => ({
  isAndroidRuntime: isAndroidRuntimeMock,
}))

import SwitchField from './fields/SwitchField.vue'
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
  Select: createBrowserContainerStub('StubSelect'),
  SelectContent: createBrowserContainerStub('StubSelectContent'),
  SelectItem: createBrowserContainerStub('StubSelectItem'),
  SelectTrigger: defineComponent({
    name: 'StubSelectTrigger',
    setup(_, { attrs, slots }) {
      return () => h('button', {
        ...attrs,
        role: 'combobox',
        type: 'button',
      }, slots.default?.())
    },
  }),
  SelectValue: createBrowserContainerStub('StubSelectValue', 'span'),
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
        androidDisplayValue: '托管项目目录',
        buttonLabel: '浏览',
        dialogTitle: '选择项目路径',
        label: '项目路径',
        description: '用于存放项目文件',
        immediate: true,
        readonlyOnAndroid: true,
      },
      language: {
        type: 'select',
        default: 'system',
        label: '语言',
        description: '选择界面语言',
        placeholder: '请选择语言',
        options: [
          { value: 'system', label: '跟随系统' },
          { value: 'zh-Hans', label: '简体中文' },
        ],
      },
      compactInput: {
        type: 'input',
        default: '',
        label: '紧凑输入',
      },
      stackedInput: {
        type: 'input',
        default: '',
        label: '换行输入',
        description: '输入内容',
        layout: 'stacked',
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

function renderSwitchFieldValidationHarness() {
  const Harness = defineComponent({
    name: 'SwitchFieldValidationHarness',
    setup() {
      const form = useForm({
        initialValues: {
          advancedMode: false,
        },
        validationSchema: z.object({
          advancedMode: z.boolean().refine(value => value, {
            error: '必须开启',
          }),
        }),
      })

      onMounted(() => {
        void form.validateField('advancedMode')
      })

      const field = {
        type: 'switch',
        default: false,
        label: '高级模式',
        description: '开启后才能继续',
      } as const

      return () => h(FormField, { name: 'advancedMode' }, {
        default: (slotProps: {
          componentField?: Record<string, unknown>
          handleChange: (event: Event | unknown, shouldValidate?: boolean) => void
          value: unknown
        }) => h(SwitchField, {
          field,
          value: slotProps.value as boolean | undefined,
          handleChange: slotProps.handleChange,
          componentField: slotProps.componentField,
        }),
      })
    },
  })

  return renderInBrowser(Harness, {
    browser: { i18nMode: 'lite' },
    global: {
      stubs: globalStubs,
    },
  })
}

function findBrowseButton() {
  const button = [...document.querySelectorAll('button')]
    .find(element => element.textContent?.trim() === '浏览')

  if (!button) {
    throw new Error('browse button should be rendered')
  }

  return button
}

describe('SettingsForm', () => {
  beforeEach(() => {
    isAndroidRuntimeMock.mockReturnValue(false)
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

    findBrowseButton().click()
    await nextTick()

    expect(openDialogMock).toHaveBeenCalledWith({
      title: '选择项目路径',
      directory: true,
      multiple: false,
      defaultPath: undefined,
    })
    await expect.element(page.getByTestId('path-probe')).toHaveTextContent('/demo/project')

    openDialogMock.mockResolvedValue('/demo/project-next')
    findBrowseButton().click()
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

  it('Android 托管目录字段只读展示且不会调用目录选择器', async () => {
    isAndroidRuntimeMock.mockReturnValue(true)
    const result = renderSettingsFormHarness()

    const managedPathInput = [...document.querySelectorAll('input')]
      .find(input => input.value === '托管项目目录')
    if (!managedPathInput) {
      throw new Error('managed path input should be rendered')
    }
    expect(managedPathInput.disabled || managedPathInput.readOnly).toBe(true)
    await expect.element(page.getByRole('button', { name: '浏览' })).not.toBeInTheDocument()
    expect(openDialogMock).not.toHaveBeenCalled()

    await result.unmount()
  })

  it('folderPicker 字段会把 label 与描述信息绑定到真正可聚焦的按钮', async () => {
    const result = renderSettingsFormHarness()
    const trigger = findBrowseButton()
    const label = [...document.querySelectorAll('label')]
      .find(element => element.textContent?.trim() === '项目路径')

    if (!label) {
      throw new Error('project path label should be rendered')
    }

    expect(label.getAttribute('for')).toBeTruthy()
    expect(trigger.getAttribute('id')).toBe(label.getAttribute('for'))
    expect(trigger.getAttribute('aria-describedby')).toContain('-form-item-description')
    expect(trigger.getAttribute('aria-invalid')).toBe('false')

    await result.unmount()
  })

  it('select 字段会把 label 与描述信息绑定到真正可聚焦的 trigger', async () => {
    const result = renderSettingsFormHarness()

    const trigger = await page.getByRole('combobox').element()
    const label = [...document.querySelectorAll('label')]
      .find(element => element.textContent?.trim() === '语言')

    if (!label) {
      throw new Error('language label should be rendered')
    }

    expect(label.getAttribute('for')).toBeTruthy()
    expect(trigger.getAttribute('id')).toBe(label.getAttribute('for'))
    expect(trigger.getAttribute('aria-describedby')).toContain('-form-item-description')
    expect(trigger.getAttribute('aria-invalid')).toBe('false')

    await result.unmount()
  })

  it('input 字段默认紧凑排列，并支持显式换行排列', async () => {
    const result = renderSettingsFormHarness()

    function findFieldContainer(labelText: string) {
      const label = [...document.querySelectorAll('label')]
        .find(element => element.textContent?.trim() === labelText)

      const fieldContainer = label?.closest('div.max-w-120')

      if (!fieldContainer) {
        throw new Error(`${labelText} field should be rendered`)
      }

      return fieldContainer
    }

    expect(findFieldContainer('紧凑输入').className).toContain('flex-row')
    expect(findFieldContainer('换行输入').className).toContain('flex-col')

    await result.unmount()
  })

  it('switch 字段校验失败时会显示错误消息', async () => {
    const result = renderSwitchFieldValidationHarness()
    const control = await page.getByRole('checkbox').element()

    await expect.element(page.getByText('必须开启')).toBeInTheDocument()
    expect(control.getAttribute('aria-describedby')).toContain('-form-item-message')
    expect(control.getAttribute('aria-invalid')).toBe('true')

    await result.unmount()
  })
})
