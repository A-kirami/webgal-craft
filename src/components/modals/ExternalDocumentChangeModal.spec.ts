import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'

import ExternalDocumentChangeModal from './ExternalDocumentChangeModal.vue'

const ExternalDocumentDiffEditorStub = defineComponent({
  name: 'ExternalDocumentDiffEditor',
  props: {
    externalContent: {
      type: String,
      required: true,
    },
    localContent: {
      type: String,
      required: true,
    },
  },
  emits: ['apply', 'back'],
  template: `
    <div>
      <span>{{ localContent }} | {{ externalContent }}</span>
      <button type="button" @click="$emit('apply', 'merged result')">apply-merge-result</button>
      <button type="button" @click="$emit('back')">back-to-decision</button>
    </div>
  `,
})

function renderModal(props: Record<string, unknown>) {
  return renderInBrowser(ExternalDocumentChangeModal, {
    browser: {
      i18nMode: 'lite',
    },
    global: {
      stubs: {
        ExternalDocumentDiffEditor: ExternalDocumentDiffEditorStub,
      },
    },
    props: {
      open: true,
      path: '/game/scene.txt',
      documentKind: 'scene',
      allowMerge: true,
      localContent: 'local content',
      externalContent: 'external content',
      ...props,
    },
  })
}

describe('ExternalDocumentChangeModal', () => {
  it('打开时聚焦取消操作', async () => {
    renderModal({})

    await expect.element(page.getByRole('button', { name: 'common.cancel' })).toHaveFocus()
  })

  it('先打开差异编辑器，应用结果后再执行合并回调并关闭模态框', async () => {
    const onMerge = vi.fn(async () => undefined)
    const updateOpen = vi.fn()

    renderModal({
      onMerge,
      'onUpdate:open': updateOpen,
    })

    await page.getByRole('button', { name: 'modals.externalDocumentChange.reviewAndMerge' }).click()

    expect(onMerge).not.toHaveBeenCalled()
    await expect.element(page.getByText('local content | external content')).toBeVisible()

    await page.getByRole('button', { name: 'apply-merge-result' }).click()

    expect(onMerge).toHaveBeenCalledWith('merged result')
    await expect.poll(() => updateOpen.mock.calls.some(([open]) => open === false)).toBe(true)
  })

  it('从差异编辑器返回时保留冲突决策弹窗', async () => {
    const onCancel = vi.fn()
    const updateOpen = vi.fn()

    renderModal({
      onCancel,
      'onUpdate:open': updateOpen,
    })

    await page.getByRole('button', { name: 'modals.externalDocumentChange.reviewAndMerge' }).click()
    await page.getByRole('button', { name: 'back-to-decision' }).click()

    await expect.element(page.getByRole('button', { name: 'modals.externalDocumentChange.keepLocal' })).toBeVisible()
    expect(onCancel).not.toHaveBeenCalled()
    expect(updateOpen).not.toHaveBeenCalledWith(false)
  })

  it('点击保留本地版本会执行保留本地回调并关闭模态框', async () => {
    const onKeepLocal = vi.fn(async () => undefined)
    const updateOpen = vi.fn()

    renderModal({
      'allowMerge': false,
      onKeepLocal,
      'onUpdate:open': updateOpen,
    })

    await page.getByRole('button', { name: 'modals.externalDocumentChange.keepLocal' }).click()

    expect(onKeepLocal).toHaveBeenCalledTimes(1)
    await expect.poll(() => updateOpen.mock.calls.some(([open]) => open === false)).toBe(true)
  })
})
