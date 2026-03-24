import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

import { createBrowserTestI18n } from '~/__tests__/browser'

import ExternalDocumentChangeModal from './ExternalDocumentChangeModal.vue'

describe('ExternalDocumentChangeModal', () => {
  it('点击 merge 会执行 onMerge 并关闭模态框', async () => {
    const onMerge = vi.fn(async () => undefined)
    const updateOpen = vi.fn()

    render(ExternalDocumentChangeModal, {
      props: {
        'open': true,
        'path': '/game/scene.txt',
        'allowMerge': true,
        onMerge,
        'onUpdate:open': updateOpen,
      },
      global: {
        plugins: [createBrowserTestI18n()],
      },
    })

    await page.getByRole('button', { name: 'modals.externalDocumentChange.merge' }).click()

    expect(onMerge).toHaveBeenCalledTimes(1)
    await expect.poll(() => updateOpen.mock.calls.some(([open]) => open === false)).toBe(true)
  })

  it('点击 keep local 会执行 onKeepLocal 并关闭模态框', async () => {
    const onKeepLocal = vi.fn(async () => undefined)
    const updateOpen = vi.fn()

    render(ExternalDocumentChangeModal, {
      props: {
        'open': true,
        'path': '/game/scene.txt',
        'allowMerge': false,
        onKeepLocal,
        'onUpdate:open': updateOpen,
      },
      global: {
        plugins: [createBrowserTestI18n()],
      },
    })

    await page.getByRole('button', { name: 'modals.externalDocumentChange.keepLocal' }).click()

    expect(onKeepLocal).toHaveBeenCalledTimes(1)
    await expect.poll(() => updateOpen.mock.calls.some(([open]) => open === false)).toBe(true)
  })
})
