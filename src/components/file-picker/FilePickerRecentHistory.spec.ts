import { describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'

import FilePickerRecentHistory from './FilePickerRecentHistory.vue'

const globalStubs = {
  Button: defineComponent({
    name: 'StubButton',
    emits: ['click'],
    setup(_, { attrs, emit, slots }) {
      return () => h('button', {
        ...attrs,
        type: 'button',
        onClick: (event: MouseEvent) => emit('click', event),
      }, slots.default?.())
    },
  }),
}

describe('FilePickerRecentHistory', () => {
  it('点击历史项时会发出 select 事件', async () => {
    const onSelect = vi.fn()

    render(FilePickerRecentHistory, {
      props: {
        clearLabel: 'Clear recent history',
        invalidMap: {},
        items: ['images/bg/opening.png'],
        onSelect,
        title: 'Recent history',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'opening.png' }).click()

    expect(onSelect).toHaveBeenCalledWith('images/bg/opening.png')
  })

  it('点击清空按钮时会发出 clear 事件', async () => {
    const onClear = vi.fn()

    render(FilePickerRecentHistory, {
      props: {
        clearLabel: 'Clear recent history',
        invalidMap: {},
        items: ['images/bg/opening.png'],
        onClear,
        title: 'Recent history',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'Clear recent history' }).click()

    expect(onClear).toHaveBeenCalledOnce()
  })

  it('按左右方向键时会在历史项之间移动焦点', async () => {
    render(FilePickerRecentHistory, {
      props: {
        clearLabel: 'Clear recent history',
        invalidMap: {},
        items: [
          'images/bg/opening.png',
          'images/bg/title.png',
          'images/bg/ending.png',
        ],
        title: 'Recent history',
      },
      global: {
        stubs: globalStubs,
      },
    })

    const openingButton = page.getByRole('button', { name: 'opening.png' })
    const titleButton = page.getByRole('button', { name: 'title.png' })

    await openingButton.click()
    await userEvent.keyboard('{ArrowRight}')
    await expect.element(titleButton).toHaveFocus()

    await userEvent.keyboard('{ArrowLeft}')
    await expect.element(openingButton).toHaveFocus()
  })
})
