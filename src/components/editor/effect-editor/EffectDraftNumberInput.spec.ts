import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, nextTick, shallowRef } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'

import EffectDraftNumberInput from './EffectDraftNumberInput.vue'

const ControlledInput = defineComponent({
  setup() {
    const value = shallowRef('1.2')

    function normalizeValue(rawValue: string): void {
      const numberValue = Number(rawValue)
      if (Number.isFinite(numberValue)) {
        value.value = String(numberValue)
      }
    }

    return () => h('div', [
      h(EffectDraftNumberInput, {
        'aria-label': 'Alpha',
        'modelValue': value.value,
        'onCommit': normalizeValue,
        'onUpdate:modelValue': normalizeValue,
      }),
      h('button', {
        'aria-label': 'Apply external value',
        'type': 'button',
        'onPointerdown': (event: PointerEvent) => {
          event.preventDefault()
          value.value = '2.5'
        },
      }),
    ])
  },
})

describe('EffectDraftNumberInput', () => {
  it('未编辑时失焦或按下 Enter 不会提交展示值', async () => {
    const commit = vi.fn()

    renderInBrowser(EffectDraftNumberInput, {
      props: {
        'aria-label': 'Alpha',
        'modelValue': '1',
        'onCommit': commit,
      },
    })

    const input = page.getByRole('textbox', { name: 'Alpha' })
    const inputElement = await input.element() as HTMLInputElement

    inputElement.focus()
    inputElement.blur()
    await nextTick()

    inputElement.focus()
    inputElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
    await nextTick()

    expect(commit).not.toHaveBeenCalled()
  })

  it('按下 Enter 只提交一次当前草稿', async () => {
    const commit = vi.fn()

    renderInBrowser(EffectDraftNumberInput, {
      props: {
        'aria-label': 'Alpha',
        'modelValue': '1.2',
        'onCommit': commit,
      },
    })

    const input = page.getByRole('textbox', { name: 'Alpha' })
    const inputElement = await input.element() as HTMLInputElement

    await input.fill('1.30')
    inputElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
    await nextTick()

    expect(commit).toHaveBeenCalledOnce()
    expect(commit).toHaveBeenCalledWith('1.30')

    inputElement.blur()
    await nextTick()

    expect(commit).toHaveBeenCalledOnce()
  })

  it('编辑时保留浮点中间文本，失焦后同步归一化值', async () => {
    renderInBrowser(ControlledInput)

    const input = page.getByRole('textbox', { name: 'Alpha' })

    await input.fill('1.2')
    await nextTick()
    const inputElement = await input.element() as HTMLInputElement

    inputElement.focus()
    inputElement.setSelectionRange(3, 3)
    inputElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Backspace' }))
    inputElement.setRangeText('', 2, 3, 'end')
    inputElement.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'deleteContentBackward',
    }))
    inputElement.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Backspace' }))
    await nextTick()
    expect(inputElement.value).toBe('1.')
    expect(inputElement.selectionStart).toBe(2)

    inputElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: '3' }))
    inputElement.setRangeText('3', 2, 2, 'end')
    inputElement.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      data: '3',
      inputType: 'insertText',
    }))
    inputElement.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: '3' }))
    await nextTick()
    expect(inputElement.value).toBe('1.3')

    await input.fill('1.30')
    await nextTick()
    expect(inputElement.value).toBe('1.30')

    inputElement.blur()
    await nextTick()
    await nextTick()

    expect(inputElement.value).toBe('1.3')
  })

  it('编辑期间的外部更新会接管草稿且不会被失焦覆盖', async () => {
    renderInBrowser(ControlledInput)

    const input = page.getByRole('textbox', { name: 'Alpha' })
    const inputElement = await input.element() as HTMLInputElement

    await input.fill('1.30')
    await nextTick()
    expect(inputElement.value).toBe('1.30')

    const externalControl = await page.getByRole('button', { name: 'Apply external value' }).element()
    externalControl.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
      cancelable: true,
    }))
    await nextTick()

    expect(document.activeElement).toBe(inputElement)
    expect(inputElement.value).toBe('2.5')

    inputElement.blur()
    await nextTick()

    expect(inputElement.value).toBe('2.5')
  })
})
