import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import { renderInBrowser } from '~/__tests__/browser-render'

import ExternalDocumentChangeModal from './ExternalDocumentChangeModal.vue'

describe('ExternalDocumentChangeModal', () => {
  it('点击合并会执行合并回调并关闭模态框', async () => {
    const onMerge = vi.fn(async () => undefined)
    const updateOpen = vi.fn()

    renderInBrowser(ExternalDocumentChangeModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        'path': '/game/scene.txt',
        'allowMerge': true,
        onMerge,
        'onUpdate:open': updateOpen,
      },
    })

    await page.getByRole('button', { name: 'modals.externalDocumentChange.merge' }).click()

    expect(onMerge).toHaveBeenCalledTimes(1)
    await expect.poll(() => updateOpen.mock.calls.some(([open]) => open === false)).toBe(true)
  })

  it('点击保留本地版本会执行保留本地回调并关闭模态框', async () => {
    const onKeepLocal = vi.fn(async () => undefined)
    const updateOpen = vi.fn()

    renderInBrowser(ExternalDocumentChangeModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        'path': '/game/scene.txt',
        'allowMerge': false,
        onKeepLocal,
        'onUpdate:open': updateOpen,
      },
    })

    await page.getByRole('button', { name: 'modals.externalDocumentChange.keepLocal' }).click()

    expect(onKeepLocal).toHaveBeenCalledTimes(1)
    await expect.poll(() => updateOpen.mock.calls.some(([open]) => open === false)).toBe(true)
  })
})
