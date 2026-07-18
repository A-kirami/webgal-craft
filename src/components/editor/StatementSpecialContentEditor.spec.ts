import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import { createBrowserClickStub, createBrowserContainerStub, createBrowserInputStub, renderInBrowser } from '~/__tests__/browser-render'

import StatementSpecialContentEditor from './StatementSpecialContentEditor.vue'

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  FilePicker: createBrowserInputStub('StubFilePicker'),
  Input: createBrowserInputStub('StubInput'),
  Label: createBrowserContainerStub('StubLabel', 'label'),
}

describe('StatementSpecialContentEditor', () => {
  it.each(['inline', 'panel'] as const)('在 %s 分支行尾显示唯一的默认状态并发出对应索引', async (surface) => {
    const handleChooseDefault = vi.fn()

    renderInBrowser(StatementSpecialContentEditor, {
      props: {
        surface,
        mode: 'choose',
        setVarContent: { name: '', value: '' },
        chooseItems: [
          { name: '继续', file: 'next.txt' },
          { name: '返回', file: 'back.txt' },
        ],
        defaultChooseIndex: 1,
        styleRuleItems: [],
        sceneRootPath: '',
        onChooseDefault: handleChooseDefault,
      },
      global: {
        stubs: globalStubs,
      },
    })

    const setDefaultButtons = page.getByRole('button', { name: 'edit.visualEditor.accessibility.setDefaultChoice' })
    const clearDefaultButton = page.getByRole('button', { name: 'edit.visualEditor.accessibility.clearDefaultChoice' })

    await expect.element(setDefaultButtons.first()).toHaveTextContent('edit.visualEditor.options.default')
    await expect.element(setDefaultButtons.first()).toHaveAttribute('aria-pressed', 'false')
    await expect.element(clearDefaultButton).toHaveAttribute('aria-pressed', 'true')

    await setDefaultButtons.first().click()
    await clearDefaultButton.click()

    expect(handleChooseDefault).toHaveBeenNthCalledWith(1, 0)
    expect(handleChooseDefault).toHaveBeenNthCalledWith(2, 1)
  })
})
