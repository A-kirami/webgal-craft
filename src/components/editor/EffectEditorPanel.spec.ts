import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import { createBrowserLocalizedI18n } from '~/__tests__/browser'
import {
  createBrowserClickStub,
  createBrowserTextStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

import EffectEditorPanel from './EffectEditorPanel.vue'

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  EffectDraftForm: createBrowserTextStub('StubEffectDraftForm', 'Effect Draft Form'),
}

function renderPanel(options: {
  canClear: boolean
  onClear?: () => void
}) {
  renderInBrowser(EffectEditorPanel, {
    props: {
      canApply: false,
      canClear: options.canClear,
      duration: '',
      ease: '',
      onClear: options.onClear,
      transform: {},
    },
    global: {
      plugins: [createBrowserLocalizedI18n({ locale: 'zh-Hans' })],
      stubs: globalStubs,
    },
  })
}

describe('EffectEditorPanel', () => {
  it('草稿为空时显示禁用的次要清除按钮', async () => {
    renderPanel({ canClear: false })

    const clearButton = page.getByRole('button', { name: '清除' })

    await expect.element(clearButton).toBeDisabled()
    await expect.element(clearButton).toHaveAttribute('variant', 'outline')
    await expect.element(page.getByRole('button', { name: '还原' })).not.toBeInTheDocument()
  })

  it('草稿非空时点击清除会发出清除事件', async () => {
    const onClear = vi.fn()
    renderPanel({ canClear: true, onClear })

    const clearButton = page.getByRole('button', { name: '清除' })
    await expect.element(clearButton).toBeEnabled()
    await clearButton.click()

    expect(onClear).toHaveBeenCalledTimes(1)
  })
})
