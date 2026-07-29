import { describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { h } from 'vue'

import { createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'
// @unocss-safelist opacity-0 opacity-100 group-focus-visible:opacity-100 group-has-[:focus-visible]:opacity-100 group-hover:opacity-100
import 'virtual:uno.css'

import CommandPanelCard from './CommandPanelCard.vue'

const globalStubs = {
  Tooltip: createBrowserContainerStub('StubTooltip'),
  TooltipContent: createBrowserContainerStub('StubTooltipContent'),
  TooltipTrigger: createBrowserContainerStub('StubTooltipTrigger'),
}

describe('CommandPanelCard', () => {
  it('开启常显动作时动作区保持可见', () => {
    renderInBrowser(CommandPanelCard, {
      props: {
        actionsAlwaysVisible: true,
        title: 'Dialogue',
      },
      slots: {
        actions: () => h('button', { type: 'button' }, 'favorite-action'),
      },
      global: {
        stubs: globalStubs,
      },
    })

    const actionButton = [...document.querySelectorAll('button')]
      .find(button => button.textContent === 'favorite-action')
    if (!actionButton?.parentElement) {
      throw new TypeError('expected favorite action button')
    }
    expect(actionButton.parentElement).toHaveStyle({ opacity: '1' })
  })

  it('点击动作区按钮不会触发卡片点击', async () => {
    const handleClick = vi.fn()

    renderInBrowser(CommandPanelCard, {
      props: {
        onClick: handleClick,
        title: 'Dialogue',
      },
      slots: {
        actions: () => h('button', { type: 'button' }, 'edit-action'),
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'Dialogue' }).hover()
    await page.getByRole('button', { name: 'edit-action', exact: true }).click()

    expect(handleClick).not.toHaveBeenCalled()
  })

  it('键盘焦点位于卡片或动作按钮时动作区保持可见', async () => {
    renderInBrowser(CommandPanelCard, {
      props: {
        title: 'Dialogue',
      },
      slots: {
        actions: () => h('button', { type: 'button' }, 'edit-action'),
      },
      global: {
        stubs: globalStubs,
      },
    })

    const actionButton = page.getByRole('button', { name: 'edit-action', exact: true })
    const actionElement = actionButton.element()
    const actions = actionElement.parentElement
    if (!actions) {
      throw new TypeError('expected command panel card actions')
    }

    await userEvent.tab()
    await expect.poll(() => getComputedStyle(actions).opacity).toBe('1')

    await userEvent.tab()
    expect(document.activeElement).toBe(actionElement)
    await expect.poll(() => getComputedStyle(actions).opacity).toBe('1')
  })

  it('点击卡片主体仍会触发卡片点击', async () => {
    const handleClick = vi.fn()

    renderInBrowser(CommandPanelCard, {
      props: {
        onClick: handleClick,
        title: 'Dialogue',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'Dialogue' }).click()

    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
