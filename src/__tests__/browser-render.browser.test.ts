import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserActionStub,
  createBrowserCheckboxStub,
  createBrowserEmitStub,
  createBrowserInputStub,
  createBrowserTextStub,
  createBrowserValueStub,
  renderInBrowser,
} from './browser-render'

describe('browser-render helper stubs', () => {
  it('createBrowserTextStub 会渲染固定占位文本', async () => {
    renderInBrowser(createBrowserTextStub('StubText', 'placeholder-text'))

    await expect.element(page.getByText('placeholder-text')).toBeInTheDocument()
  })

  it('createBrowserValueStub 会透传 id 并把数组 modelValue 映射为 value', async () => {
    renderInBrowser(createBrowserValueStub('StubValue', 'input'), {
      props: {
        id: 'value-probe',
        modelValue: ['first-item'],
      },
    })

    await expect.element(page.getByRole('textbox')).toHaveAttribute('id', 'value-probe')
    await expect.element(page.getByRole('textbox')).toHaveAttribute('value', 'first-item')
  })

  it('createBrowserInputStub 会转发 update:modelValue', async () => {
    const handleUpdate = vi.fn()

    renderInBrowser(createBrowserInputStub('StubInput'), {
      props: {
        'id': 'input-probe',
        'modelValue': 'before',
        'placeholder': 'Input probe',
        'onUpdate:modelValue': handleUpdate,
      },
    })

    await page.getByRole('textbox', { name: 'Input probe' }).fill('after')

    expect(handleUpdate).toHaveBeenLastCalledWith('after')
  })

  it('createBrowserCheckboxStub 会转发 update:modelValue', async () => {
    const handleUpdate = vi.fn()

    renderInBrowser(createBrowserCheckboxStub('StubCheckbox'), {
      props: {
        'id': 'checkbox-probe',
        'modelValue': false,
        'onUpdate:modelValue': handleUpdate,
      },
    })

    await page.getByRole('checkbox').click()

    expect(handleUpdate).toHaveBeenLastCalledWith(true)
  })

  it('createBrowserEmitStub 会在点击时发出指定事件和 payload', async () => {
    const handleNavigate = vi.fn()

    renderInBrowser(createBrowserEmitStub('StubEmit', {
      eventName: 'navigate',
      payload: 'images/bg',
      text: 'emit-trigger',
    }), {
      props: {
        onNavigate: handleNavigate,
      },
    })

    await page.getByRole('button', { name: 'emit-trigger' }).click()

    expect(handleNavigate).toHaveBeenLastCalledWith('images/bg')
  })

  it('createBrowserActionStub 会渲染动作按钮、默认插槽和命名插槽，并发出计算后的 payload', async () => {
    const handleSelect = vi.fn()

    renderInBrowser(createBrowserActionStub('StubAction', {
      eventName: 'select',
      includeDefaultSlot: true,
      namedSlots: ['actions', 'tooltip'],
      payload: (props: Record<string, unknown>) => String(props.title).toLowerCase(),
      props: {
        title: {
          type: String,
          required: true,
        },
      },
      testId: 'action-trigger',
      text: (props: Record<string, unknown>) => String(props.title),
    }), {
      props: {
        onSelect: handleSelect,
        title: 'Hello Action',
      },
      slots: {
        actions: '<span>actions-slot</span>',
        default: '<span>default-slot</span>',
        tooltip: '<span>tooltip-slot</span>',
      },
    })

    await expect.element(page.getByText('actions-slot')).toBeInTheDocument()
    await expect.element(page.getByText('default-slot')).toBeInTheDocument()
    await expect.element(page.getByText('tooltip-slot')).toBeInTheDocument()

    await page.getByTestId('action-trigger').click()

    expect(handleSelect).toHaveBeenLastCalledWith('hello action')
  })
})
