import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserActionStub,
  createBrowserContainerStub,
  createBrowserTextStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { useEditSettingsStore } from '~/stores/edit-settings'

import ParamChoiceField from './ParamChoiceField.vue'

import type { ParamSelectOptionItem } from './controls/types'
import type { Component } from 'vue'

function createSelectStub() {
  return createBrowserActionStub('SelectStub', {
    eventName: 'update:model-value',
    includeDefaultSlot: true,
    payload: 42,
    testId: 'select-update',
    text: 'emit select',
  })
}

function createComboboxStub() {
  return createBrowserActionStub('ComboboxStub', {
    eventName: 'update:model-value',
    payload: 77,
    testId: 'combobox-update',
    text: 'emit combobox',
  })
}

function createCascadingComboboxStub() {
  return defineComponent({
    name: 'CascadingComboboxStub',
    props: {
      browseNodes: {
        type: Array,
        default: () => [],
      },
      itemClass: {
        type: String,
        default: '',
      },
      searchDocuments: {
        type: Array,
        default: () => [],
      },
    },
    emits: ['update:model-value'],
    setup(props, { emit }) {
      return () => h('button', {
        'data-testid': 'cascading-combobox-update',
        'data-browse-count': String(props.browseNodes.length),
        'data-item-class': props.itemClass,
        'data-search-count': String(props.searchDocuments.length),
        'type': 'button',
        'onClick': () => emit('update:model-value', 77),
      }, 'emit cascading combobox')
    },
  })
}

function createSegmentedStub() {
  return createBrowserActionStub('SegmentedControlStub', {
    eventName: 'update-select',
    payload: 99,
    testId: 'segmented-update',
    text: 'emit segmented',
  })
}

const globalStubs = {
  CascadingCombobox: createCascadingComboboxStub(),
  Combobox: createComboboxStub(),
  SegmentedControl: createSegmentedStub(),
  Select: createSelectStub(),
  SelectContent: createBrowserContainerStub('SelectContentStub'),
  SelectItem: createBrowserContainerStub('SelectItemStub'),
  SelectTrigger: createBrowserContainerStub('SelectTriggerStub', 'button'),
  SelectValue: createBrowserTextStub('SelectValueStub', 'SelectValue', 'span'),
}

// 验证滚轮事件能到达真实控件时只保留其余分支的 stub，避免同时挂载无关的真实浮层。
const realComboboxStubs = {
  CascadingCombobox: globalStubs.CascadingCombobox,
  SegmentedControl: globalStubs.SegmentedControl,
}

const realSelectStubs = {
  ...realComboboxStubs,
  Combobox: globalStubs.Combobox,
}

const baseOptions: ParamSelectOptionItem[] = [{ label: 'Hero', value: 'hero' }]

const wheelOptions: ParamSelectOptionItem[] = [
  { label: 'Hero', value: 'hero' },
  { label: 'Villain', value: 'villain' },
  { label: 'Guide', value: 'guide' },
]

function requireWheelTrigger(selector: string): HTMLButtonElement {
  const element = document.querySelector(selector)
  if (!(element instanceof HTMLButtonElement)) {
    throw new TypeError(`expected a button matching ${selector}`)
  }
  return element
}

function dispatchWheel(target: EventTarget, deltaY: number): WheelEvent {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY })
  target.dispatchEvent(event)
  return event
}

interface RenderWheelChoiceFieldOptions {
  enableWheelSelect: boolean
  mode: 'select' | 'combobox'
  onUpdateSelect: (value: unknown) => void
  selectValue: string
  stubs?: Record<string, Component>
}

function renderWheelChoiceField(options: RenderWheelChoiceFieldOptions) {
  const pinia = createPinia()
  useEditSettingsStore(pinia).enableWheelSelect = options.enableWheelSelect

  renderInBrowser(ParamChoiceField, {
    props: {
      comboboxData: undefined,
      inputId: 'target-input',
      mode: options.mode,
      notSelectedLabel: 'Not selected',
      options: wheelOptions,
      placeholder: 'Select target',
      renderSegmented: false,
      selectValue: options.selectValue,
      onUpdateSelect: options.onUpdateSelect,
    },
    browser: {
      pinia,
    },
    global: {
      stubs: options.stubs ?? globalStubs,
    },
  })
}

describe('ParamChoiceField', () => {
  it('segmented 选择会归一化后触发 updateSelect', async () => {
    const onUpdateSelect = vi.fn()

    renderInBrowser(ParamChoiceField, {
      props: {
        comboboxData: undefined,
        inputId: 'target-input',
        mode: 'select',
        notSelectedLabel: 'Not selected',
        options: baseOptions,
        placeholder: 'Select target',
        renderSegmented: true,
        selectValue: '',
        onUpdateSelect,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('segmented-update').click()
    expect(onUpdateSelect).toHaveBeenCalledWith('99')
  })

  it('select 分支会透传并归一化 updateSelect', async () => {
    const onUpdateSelect = vi.fn()

    renderInBrowser(ParamChoiceField, {
      props: {
        comboboxData: undefined,
        inputId: 'target-input',
        mode: 'select',
        notSelectedLabel: 'Not selected',
        options: baseOptions,
        placeholder: 'Select target',
        renderSegmented: false,
        selectValue: '',
        onUpdateSelect,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('select-update').click()
    expect(onUpdateSelect).toHaveBeenCalledWith('42')
  })

  it('combobox 分支会透传结构化数据并归一化 updateSelect', async () => {
    const onUpdateSelect = vi.fn()

    renderInBrowser(ParamChoiceField, {
      props: {
        comboboxData: {
          browseNodes: [
            { id: 'group:charc', kind: 'group', label: 'charc', pathSegments: ['charc'], children: [] },
          ],
          searchDocuments: [
            { label: 'charc/default', originalIndex: 0, pathText: 'charc/default', value: 'charc/default' },
          ],
        },
        inputId: 'target-input',
        itemClass: 'py-1.25',
        mode: 'combobox',
        notSelectedLabel: 'Not selected',
        options: baseOptions,
        placeholder: 'Search target',
        renderSegmented: false,
        selectValue: '',
        onUpdateSelect,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByTestId('cascading-combobox-update')).toHaveAttribute('data-browse-count', '1')
    await expect.element(page.getByTestId('cascading-combobox-update')).toHaveAttribute('data-search-count', '1')
    await expect.element(page.getByTestId('cascading-combobox-update')).toHaveAttribute('data-item-class', 'py-1.25')
    await page.getByTestId('cascading-combobox-update').click()
    expect(onUpdateSelect).toHaveBeenCalledWith('77')
  })

  it('combobox 分支在没有级联数据时回退到基础 Combobox', async () => {
    const onUpdateSelect = vi.fn()

    renderInBrowser(ParamChoiceField, {
      props: {
        comboboxData: undefined,
        inputId: 'target-input',
        mode: 'combobox',
        notSelectedLabel: 'Not selected',
        options: baseOptions,
        placeholder: 'Search target',
        renderSegmented: false,
        selectValue: '',
        onUpdateSelect,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('combobox-update').click()
    expect(onUpdateSelect).toHaveBeenCalledWith('77')
  })

  it('select 分支候选项在未传 itemClass 时保持 py-1.5 行高', async () => {
    renderInBrowser(ParamChoiceField, {
      props: {
        comboboxData: undefined,
        inputId: 'target-input',
        mode: 'select',
        notSelectedLabel: 'Not selected',
        options: baseOptions,
        placeholder: 'Select target',
        renderSegmented: false,
        selectValue: '',
        onUpdateSelect: vi.fn(),
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('Hero')).toHaveClass('py-1.5')
  })

  it('select 分支候选项会应用 itemClass 的行内边距覆盖', async () => {
    renderInBrowser(ParamChoiceField, {
      props: {
        comboboxData: undefined,
        inputId: 'target-input',
        itemClass: 'py-1.25',
        mode: 'select',
        notSelectedLabel: 'Not selected',
        options: baseOptions,
        placeholder: 'Select target',
        renderSegmented: false,
        selectValue: '',
        onUpdateSelect: vi.fn(),
      },
      global: {
        stubs: globalStubs,
      },
    })

    const item = page.getByText('Hero')
    await expect.element(item).toHaveClass('py-1.25')
    await expect.element(item).not.toHaveClass('py-1.5')
  })

  describe('聚焦后的滚轮切换', () => {
    it('开启后，聚焦的 Select 滚轮切换到下一个候选项并阻止外层滚动', () => {
      const onUpdateSelect = vi.fn()
      renderWheelChoiceField({
        enableWheelSelect: true,
        mode: 'select',
        onUpdateSelect,
        selectValue: 'hero',
        stubs: realSelectStubs,
      })

      const trigger = requireWheelTrigger('#target-input')
      trigger.focus()
      const event = dispatchWheel(trigger, 100)

      expect(onUpdateSelect).toHaveBeenCalledWith('villain')
      expect(event.defaultPrevented).toBe(true)
    })

    it('向上滚动切换到上一个候选项', () => {
      const onUpdateSelect = vi.fn()
      renderWheelChoiceField({ enableWheelSelect: true, mode: 'select', onUpdateSelect, selectValue: 'villain' })

      const trigger = requireWheelTrigger('#target-input')
      trigger.focus()
      dispatchWheel(trigger, -100)

      expect(onUpdateSelect).toHaveBeenCalledWith('hero')
    })

    it('未开启滚轮选择时不响应且不拦截外层滚动', () => {
      const onUpdateSelect = vi.fn()
      renderWheelChoiceField({ enableWheelSelect: false, mode: 'select', onUpdateSelect, selectValue: 'hero' })

      const trigger = requireWheelTrigger('#target-input')
      trigger.focus()
      const event = dispatchWheel(trigger, 100)

      expect(onUpdateSelect).not.toHaveBeenCalled()
      expect(event.defaultPrevented).toBe(false)
    })

    it('控件未聚焦时不响应滚轮', () => {
      const onUpdateSelect = vi.fn()
      renderWheelChoiceField({ enableWheelSelect: true, mode: 'select', onUpdateSelect, selectValue: 'hero' })

      const trigger = requireWheelTrigger('#target-input')
      trigger.focus()
      trigger.blur()
      dispatchWheel(trigger, 100)

      expect(onUpdateSelect).not.toHaveBeenCalled()
    })

    it('已在最后一个候选项时继续向下滚动不切换', () => {
      const onUpdateSelect = vi.fn()
      renderWheelChoiceField({ enableWheelSelect: true, mode: 'select', onUpdateSelect, selectValue: 'guide' })

      const trigger = requireWheelTrigger('#target-input')
      trigger.focus()
      dispatchWheel(trigger, 100)

      expect(onUpdateSelect).not.toHaveBeenCalled()
    })

    it('触控板小幅滚动累计满一格才切换', () => {
      const onUpdateSelect = vi.fn()
      renderWheelChoiceField({ enableWheelSelect: true, mode: 'select', onUpdateSelect, selectValue: 'hero' })

      const trigger = requireWheelTrigger('#target-input')
      trigger.focus()
      dispatchWheel(trigger, 40)
      dispatchWheel(trigger, 40)
      expect(onUpdateSelect).not.toHaveBeenCalled()

      dispatchWheel(trigger, 40)
      expect(onUpdateSelect).toHaveBeenCalledTimes(1)
      expect(onUpdateSelect).toHaveBeenCalledWith('villain')
    })

    it('Combobox 分支聚焦后同样响应滚轮', () => {
      const onUpdateSelect = vi.fn()
      renderWheelChoiceField({
        enableWheelSelect: true,
        mode: 'combobox',
        onUpdateSelect,
        selectValue: 'hero',
        stubs: realComboboxStubs,
      })

      const trigger = requireWheelTrigger('#target-input')
      trigger.focus()
      dispatchWheel(trigger, 100)

      expect(onUpdateSelect).toHaveBeenCalledWith('villain')
    })
  })
})
