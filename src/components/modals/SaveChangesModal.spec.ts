import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import { renderInBrowser } from '~/__tests__/browser-render'

import SaveChangesModal from './SaveChangesModal.vue'

describe('SaveChangesModal', () => {
  it('点击保存会执行保存回调并关闭模态框', async () => {
    const onSave = vi.fn(async () => undefined)
    const updateOpen = vi.fn()

    renderInBrowser(SaveChangesModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        'title': 'Unsaved changes',
        'saveLabel': 'Save now',
        'dontSaveLabel': 'Skip save',
        onSave,
        'onUpdate:open': updateOpen,
      },
    })

    await page.getByRole('button', { name: 'Save now' }).click()

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(updateOpen).toHaveBeenCalledWith(false)
  })

  it('点击不保存会执行跳过保存回调并关闭模态框', async () => {
    const onDontSave = vi.fn(async () => undefined)
    const updateOpen = vi.fn()

    renderInBrowser(SaveChangesModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        'title': 'Unsaved changes',
        'saveLabel': 'Save now',
        'dontSaveLabel': 'Skip save',
        onDontSave,
        'onUpdate:open': updateOpen,
      },
    })

    await page.getByRole('button', { name: 'Skip save' }).click()

    expect(onDontSave).toHaveBeenCalledTimes(1)
    expect(updateOpen).toHaveBeenCalledWith(false)
  })
})
