import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { h } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'

import DropdownMenu from './DropdownMenu.vue'
import DropdownMenuContent from './DropdownMenuContent.vue'
import DropdownMenuTrigger from './DropdownMenuTrigger.vue'

describe('DropdownMenuContent', () => {
  it('关闭状态挂载时不会因原生点击监听器产生警告', async () => {
    const warnings: string[] = []

    await renderInBrowser(DropdownMenu, {
      slots: {
        default: () => h(DropdownMenuContent, {
          onClick: (event: MouseEvent) => event.stopPropagation(),
        }),
      },
      global: {
        config: {
          warnHandler: message => warnings.push(message),
        },
      },
    })

    expect(warnings).toEqual([])
  })

  it('将原生属性和点击监听器传给展开后的菜单内容', async () => {
    const onClick = vi.fn((event: MouseEvent) => event.stopPropagation())

    await renderInBrowser(DropdownMenu, {
      slots: {
        default: () => [
          h(DropdownMenuTrigger, {}, () => '打开菜单'),
          h(DropdownMenuContent, {
            'data-testid': 'dropdown-content',
            onClick,
          }, () => h('button', { type: 'button' }, '测试操作')),
        ],
      },
    })

    await page.getByRole('button', { name: '打开菜单' }).click()
    await expect.element(page.getByTestId('dropdown-content')).toHaveAttribute('role', 'menu')
    await page.getByRole('button', { name: '测试操作' }).click()

    expect(onClick).toHaveBeenCalledOnce()
  })
})
