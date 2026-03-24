import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

import { createBrowserTestI18n } from '~/__tests__/browser'

import GameConfigModal from './GameConfigModal.vue'

describe('GameConfigModal', () => {
  it('打开时会渲染标题和占位内容', async () => {
    const updateOpen = vi.fn()

    render(GameConfigModal, {
      props: {
        'open': true,
        'onUpdate:open': updateOpen,
      },
      global: {
        plugins: [createBrowserTestI18n()],
      },
    })

    await expect.element(page.getByText('modals.gameConfig.title')).toBeVisible()
    await expect.element(page.getByText('Description')).toBeVisible()
    await expect.element(page.getByText('Content')).toBeVisible()
    await expect.element(page.getByText('Footer')).toBeVisible()
  })
})
