import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { h } from 'vue'

import { createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'

import CommandPanelCard from './CommandPanelCard.vue'

const globalStubs = {
  Tooltip: createBrowserContainerStub('StubTooltip'),
  TooltipContent: createBrowserContainerStub('StubTooltipContent'),
  TooltipTrigger: createBrowserContainerStub('StubTooltipTrigger'),
}

describe('CommandPanelCard', () => {
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

    await page.getByRole('button', { name: 'edit-action', exact: true }).click()

    expect(handleClick).not.toHaveBeenCalled()
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
