import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import { renderInBrowser } from '~/__tests__/browser-render'
import 'virtual:uno.css'

import FigurePositionControl from './FigurePositionControl.vue'

import type { ParamSelectOptionItem } from './types'

const positionOptions: ParamSelectOptionItem[] = [
  { label: 'Left', value: 'left' },
  { label: 'Left 14', value: 'left14' },
  { label: 'Left 13', value: 'left13' },
  { label: 'Center', value: '__unspecified__' },
  { label: 'Right 13', value: 'right13' },
  { label: 'Right 14', value: 'right14' },
  { label: 'Right', value: 'right' },
]

describe('FigurePositionControl', () => {
  it('连续渲染所有位置图标并高亮当前选项', async () => {
    renderInBrowser(FigurePositionControl, {
      props: {
        inputId: 'figure-position',
        options: positionOptions,
        selectValue: 'left13',
      },
    })

    const buttons = document.querySelectorAll('button[aria-label]')
    expect(buttons).toHaveLength(positionOptions.length)
    expect(document.querySelectorAll('svg')).toHaveLength(positionOptions.length)

    await expect.element(page.getByRole('button', { name: 'Left 13' })).toHaveClass('bg-accent', 'text-foreground')
    await expect.element(page.getByRole('button', { name: 'Right 13' })).not.toHaveClass('bg-accent')
  })

  it('选择位置时向上层提交对应值', async () => {
    const handleUpdateSelect = vi.fn()

    renderInBrowser(FigurePositionControl, {
      props: {
        inputId: 'figure-position',
        options: positionOptions,
        selectValue: 'left13',
        onUpdateSelect: handleUpdateSelect,
      },
    })

    await page.getByRole('button', { name: 'Right 14' }).click()

    expect(handleUpdateSelect).toHaveBeenCalledWith('right14')
  })

  it('悬停位置图标时通过 tooltip 显示位置文本', async () => {
    renderInBrowser(FigurePositionControl, {
      props: {
        inputId: 'figure-position',
        options: positionOptions,
        selectValue: '__unspecified__',
      },
    })

    await page.getByRole('button', { name: 'Center' }).hover()

    await expect.element(page.getByText('Center')).toBeInTheDocument()
  })
})
