import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

import { createBrowserTestI18n } from '~/__tests__/browser'

import SaveChangesModal from './SaveChangesModal.vue'

describe('SaveChangesModal', () => {
  it('点击保存会执行 onSave 并关闭模态框', async () => {
    const onSave = vi.fn(async () => undefined)
    const updateOpen = vi.fn()

    render(SaveChangesModal, {
      props: {
        'open': true,
        'title': 'Unsaved changes',
        'saveLabel': 'Save now',
        'dontSaveLabel': 'Skip save',
        onSave,
        'onUpdate:open': updateOpen,
      },
      global: {
        plugins: [createBrowserTestI18n()],
      },
    })

    await page.getByRole('button', { name: 'Save now' }).click()

    expect(onSave).toHaveBeenCalledTimes(1)
    await expect.poll(() => updateOpen.mock.calls.some(([open]) => open === false)).toBe(true)
  })

  it('点击不保存会执行 onDontSave 并关闭模态框', async () => {
    const onDontSave = vi.fn(async () => undefined)
    const updateOpen = vi.fn()

    render(SaveChangesModal, {
      props: {
        'open': true,
        'title': 'Unsaved changes',
        'saveLabel': 'Save now',
        'dontSaveLabel': 'Skip save',
        onDontSave,
        'onUpdate:open': updateOpen,
      },
      global: {
        plugins: [createBrowserTestI18n()],
      },
    })

    await page.getByRole('button', { name: 'Skip save' }).click()

    expect(onDontSave).toHaveBeenCalledTimes(1)
    await expect.poll(() => updateOpen.mock.calls.some(([open]) => open === false)).toBe(true)
  })
})
