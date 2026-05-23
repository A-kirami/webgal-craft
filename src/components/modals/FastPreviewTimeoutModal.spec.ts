import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { h, nextTick, reactive } from 'vue'

import { createBrowserLiteI18n } from '~/__tests__/browser'
import { renderInBrowser } from '~/__tests__/browser-render'

import FastPreviewTimeoutModal from './FastPreviewTimeoutModal.vue'

function createDeferredClose() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })

  return {
    promise,
    resolve,
  }
}

function createFastPreviewTimeoutModalI18n() {
  return createBrowserLiteI18n({
    messages: {
      'zh-Hans': {
        common: {
          confirm: '确认',
        },
        modals: {
          fastPreviewTimeout: {
            title: '实时预览已停止',
            summary: '预览在尝试跳转到目标行时超过时间限制，已停止本次同步。',
            suggestionsTitle: '建议检查',
            suggestionLoop: '目标行之前是否存在反复跳回的跳转或条件分支。',
            suggestionDistance: '目标行之前是否有过多需要快进执行的语句。',
            suggestionBlocking: '是否有语句在预览运行时阻塞推进。',
            nextStep: '调整脚本后，重新选择目标行或刷新预览。',
            scene: '当前场景',
            targetSentence: '目标行',
            sentence: '停止位置',
            forwardedLineCount: '已快进行数',
            elapsedTime: '耗时',
            maxDuration: '超时上限',
            diagnosticsTitle: '诊断信息',
          },
        },
      },
    },
  })
}

describe('FastPreviewTimeoutModal', () => {
  it('展示快速预览超时诊断信息并在确认后关闭', async () => {
    const onClose = vi.fn()
    const updateOpen = vi.fn()

    renderInBrowser(FastPreviewTimeoutModal, {
      global: {
        plugins: [createFastPreviewTimeoutModalI18n()],
      },
      props: {
        'open': true,
        'payload': {
          sceneName: 'scene/start.txt',
          sentenceId: 8,
          targetSentenceId: 12,
          forwardedLineCount: 24,
          elapsedMs: 151,
          maxDurationMs: 150,
        },
        onClose,
        'onUpdate:open': updateOpen,
      },
    })

    await expect.element(page.getByText('实时预览已停止')).toBeVisible()
    await expect.element(page.getByText('预览在尝试跳转到目标行时超过时间限制，已停止本次同步。')).toBeVisible()
    await expect.element(page.getByText('建议检查')).toBeVisible()
    await expect.element(page.getByText('目标行之前是否存在反复跳回的跳转或条件分支。')).toBeVisible()
    await expect.element(page.getByText('目标行之前是否有过多需要快进执行的语句。')).toBeVisible()
    await expect.element(page.getByText('是否有语句在预览运行时阻塞推进。')).toBeVisible()
    await expect.element(page.getByText('调整脚本后，重新选择目标行或刷新预览。')).toBeVisible()
    await expect.element(page.getByText('诊断信息')).toBeVisible()
    await expect.element(page.getByText('当前场景：')).toBeVisible()
    await expect.element(page.getByText('scene/start.txt')).toBeVisible()
    await expect.element(page.getByText('目标行：')).toBeVisible()
    await expect.element(page.getByText('12')).toBeVisible()
    await expect.element(page.getByText('停止位置：')).toBeVisible()
    await expect.element(page.getByText('8')).toBeVisible()
    await expect.element(page.getByText('已快进行数：')).toBeVisible()
    await expect.element(page.getByText('24')).toBeVisible()
    await expect.element(page.getByText('耗时：')).toBeVisible()
    await expect.element(page.getByText('151ms')).toBeVisible()
    await expect.element(page.getByText('超时上限：')).toBeVisible()
    await expect.element(page.getByText('150ms')).toBeVisible()

    await page.getByRole('button', { name: '确认' }).click()

    expect(onClose).toHaveBeenCalledTimes(1)
    await expect.poll(() => updateOpen.mock.calls.some(([open]) => open === false)).toBe(true)
  })

  it('确认关闭回调失败时仍会关闭弹窗', async () => {
    const onClose = vi.fn().mockRejectedValue(new Error('close failed'))
    const updateOpen = vi.fn()

    renderInBrowser(FastPreviewTimeoutModal, {
      global: {
        plugins: [createFastPreviewTimeoutModalI18n()],
      },
      props: {
        'open': true,
        'payload': {
          sceneName: 'scene/start.txt',
          sentenceId: 8,
          targetSentenceId: 12,
          forwardedLineCount: 24,
          elapsedMs: 151,
          maxDurationMs: 150,
        },
        onClose,
        'onUpdate:open': updateOpen,
      },
    })

    await page.getByRole('button', { name: '确认' }).click()

    expect(onClose).toHaveBeenCalledTimes(1)
    await expect.poll(() => updateOpen.mock.calls.some(([open]) => open === false)).toBe(true)
  })

  it('通过 v-model 关闭时也会执行关闭回调', async () => {
    const onClose = vi.fn()
    const state = reactive({
      open: true,
    })

    renderInBrowser({
      setup() {
        return () => h(FastPreviewTimeoutModal, {
          'open': state.open,
          'payload': {
            sceneName: 'scene/start.txt',
            sentenceId: 8,
            targetSentenceId: 12,
            forwardedLineCount: 24,
            elapsedMs: 151,
            maxDurationMs: 150,
          },
          onClose,
          'onUpdate:open': (open?: boolean) => {
            state.open = open ?? false
          },
        })
      },
    }, {
      global: {
        plugins: [createFastPreviewTimeoutModalI18n()],
      },
    })

    state.open = false
    await nextTick()

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('通过 v-model 关闭回调失败时不会阻断外部关闭流程', async () => {
    const onClose = vi.fn().mockRejectedValue(new Error('close failed'))
    const state = reactive({
      open: true,
    })

    renderInBrowser({
      setup() {
        return () => h(FastPreviewTimeoutModal, {
          'open': state.open,
          'payload': {
            sceneName: 'scene/start.txt',
            sentenceId: 8,
            targetSentenceId: 12,
            forwardedLineCount: 24,
            elapsedMs: 151,
            maxDurationMs: 150,
          },
          onClose,
          'onUpdate:open': (open?: boolean) => {
            state.open = open ?? false
          },
        })
      },
    }, {
      global: {
        plugins: [createFastPreviewTimeoutModalI18n()],
      },
    })

    state.open = false
    await nextTick()

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(state.open).toBe(false)
  })

  it('重新打开后旧关闭回调完成不会跳过下一次外部关闭回调', async () => {
    const closeRequests: ReturnType<typeof createDeferredClose>[] = []
    const onClose = vi.fn(() => {
      const deferredClose = createDeferredClose()
      closeRequests.push(deferredClose)

      return deferredClose.promise
    })
    const state = reactive({
      open: true,
    })

    renderInBrowser({
      setup() {
        return () => h(FastPreviewTimeoutModal, {
          'open': state.open,
          'payload': {
            sceneName: 'scene/start.txt',
            sentenceId: 8,
            targetSentenceId: 12,
            forwardedLineCount: 24,
            elapsedMs: 151,
            maxDurationMs: 150,
          },
          onClose,
          'onUpdate:open': (open?: boolean) => {
            state.open = open ?? false
          },
        })
      },
    }, {
      global: {
        plugins: [createFastPreviewTimeoutModalI18n()],
      },
    })

    state.open = false
    await nextTick()
    expect(onClose).toHaveBeenCalledTimes(1)

    state.open = true
    await nextTick()

    closeRequests[0].resolve()
    await closeRequests[0].promise
    await nextTick()

    state.open = false
    await nextTick()

    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
