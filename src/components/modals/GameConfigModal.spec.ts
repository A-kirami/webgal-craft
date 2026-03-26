import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import { renderInBrowser } from '~/__tests__/browser-render'

import GameConfigModal from './GameConfigModal.vue'

describe('GameConfigModal', () => {
  it('打开时会渲染标题和占位内容', async () => {
    const updateOpen = vi.fn()

    renderInBrowser(GameConfigModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        'onUpdate:open': updateOpen,
      },
    })

    await expect.element(page.getByText('modals.gameConfig.title')).toBeVisible()
    await expect.element(page.getByText('Description')).toBeVisible()
    await expect.element(page.getByText('Content')).toBeVisible()
    await expect.element(page.getByText('Footer')).toBeVisible()
  })
})
