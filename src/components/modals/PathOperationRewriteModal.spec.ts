import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, onErrorCaptured } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'

import PathOperationRewriteModal from './PathOperationRewriteModal.vue'

describe('PathOperationRewriteModal', () => {
  it('点击主要操作会执行默认回调并关闭模态框', async () => {
    const onDefault = vi.fn(async () => undefined)
    const updateOpen = vi.fn()

    renderInBrowser(PathOperationRewriteModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        'title': 'Update references',
        'content': 'This will update referenced files.',
        'defaultText': 'Rename and update',
        'dangerText': 'Rename only',
        'cancelText': 'Cancel',
        onDefault,
        'onUpdate:open': updateOpen,
      },
    })

    await page.getByRole('button', { name: 'Rename and update' }).click()

    await vi.waitFor(() => {
      expect(onDefault).toHaveBeenCalledTimes(1)
      expect(updateOpen).toHaveBeenCalledWith(false)
    })
  })

  it('默认回调失败后外部关闭仍会执行取消回调', async () => {
    const error = new Error('default failed')
    const capturedErrors: unknown[] = []
    const onDefault = vi.fn(async () => {
      throw error
    })
    const onCancel = vi.fn(async () => undefined)
    const updateOpen = vi.fn()
    const ErrorBoundary = defineComponent({
      props: {
        open: {
          type: Boolean,
          required: true,
        },
      },
      setup(props) {
        onErrorCaptured((capturedError) => {
          capturedErrors.push(capturedError)
          return false
        })
        return () => h(PathOperationRewriteModal, {
          'open': props.open,
          'title': 'Update references',
          'content': 'This will update referenced files.',
          'defaultText': 'Rename and update',
          'dangerText': 'Rename only',
          'cancelText': 'Cancel',
          onDefault,
          onCancel,
          'onUpdate:open': updateOpen,
        })
      },
    })

    const result = renderInBrowser(ErrorBoundary, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
      },
    })

    await page.getByRole('button', { name: 'Rename and update' }).click()

    await vi.waitFor(() => {
      expect(onDefault).toHaveBeenCalledTimes(1)
    })
    expect(updateOpen).toHaveBeenCalledWith(false)
    expect(capturedErrors).toContain(error)

    await result.rerender({ open: false })

    await vi.waitFor(() => {
      expect(onCancel).toHaveBeenCalledTimes(1)
    })
  })

  it('danger 回调未确认关闭时会保持模态框打开', async () => {
    const onDanger = vi.fn(async () => undefined)
    const updateOpen = vi.fn()

    renderInBrowser(PathOperationRewriteModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        'title': 'Update references',
        'content': 'This will update referenced files.',
        'defaultText': 'Move and update',
        'dangerText': 'Move only',
        'cancelText': 'Cancel',
        onDanger,
        'onUpdate:open': updateOpen,
      },
    })

    await page.getByRole('button', { name: 'Move only' }).click()

    await vi.waitFor(() => {
      expect(onDanger).toHaveBeenCalledTimes(1)
    })
    expect(updateOpen).not.toHaveBeenCalledWith(false)
  })

  it('danger 回调返回 true 时才会关闭模态框', async () => {
    const onDanger = vi.fn(async () => true)
    const updateOpen = vi.fn()

    renderInBrowser(PathOperationRewriteModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        'title': 'Update references',
        'content': 'This will update referenced files.',
        'defaultText': 'Move and update',
        'dangerText': 'Move only',
        'cancelText': 'Cancel',
        onDanger,
        'onUpdate:open': updateOpen,
      },
    })

    await page.getByRole('button', { name: 'Move only' }).click()

    await vi.waitFor(() => {
      expect(onDanger).toHaveBeenCalledTimes(1)
      expect(updateOpen).toHaveBeenCalledWith(false)
    })
  })
})
