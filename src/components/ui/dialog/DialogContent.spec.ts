import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'

import Dialog from './Dialog.vue'
import DialogContent from './DialogContent.vue'
import DialogDescription from './DialogDescription.vue'
import DialogTitle from './DialogTitle.vue'

async function renderDialogContent(props: { hideClose?: boolean } = {}) {
  const Harness = defineComponent({
    name: 'DialogContentHarness',
    setup() {
      return () => h(Dialog, { open: true }, () => h(DialogContent, props, {
        default: () => [
          h(DialogTitle, null, () => '标题'),
          h(DialogDescription, null, () => '说明'),
          '弹窗内容',
        ],
      }))
    },
  })

  await renderInBrowser(Harness)
}

describe('DialogContent', () => {
  it('默认渲染关闭按钮', async () => {
    await renderDialogContent()

    await expect.element(page.getByText('弹窗内容')).toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('hideClose 时隐藏关闭按钮，且不把该 prop 透传成元素属性', async () => {
    await renderDialogContent({ hideClose: true })

    await expect.element(page.getByText('弹窗内容')).toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'Close' })).not.toBeInTheDocument()

    const dialog = await page.getByRole('dialog').element()
    expect(dialog.hasAttribute('hide-close')).toBe(false)
  })
})