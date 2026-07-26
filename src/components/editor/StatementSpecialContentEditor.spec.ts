import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import { createBrowserClickStub, createBrowserContainerStub, createBrowserInputStub, renderInBrowser } from '~/__tests__/browser-render'
import Input from '~/components/ui/input/Input.vue'
import { RelPath } from '~/domain/path'
import 'virtual:uno.css'

import StatementSpecialContentEditor from './StatementSpecialContentEditor.vue'

import type { EditorFieldDiagnostic } from '~/features/editor/diagnostics/types'

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  FilePicker: createBrowserInputStub('StubFilePicker'),
  Input: createBrowserInputStub('StubInput'),
  Label: createBrowserContainerStub('StubLabel', 'label'),
}

const missingChoiceDiagnostic: EditorFieldDiagnostic = {
  assetKey: {
    assetType: 'scene',
    relativePath: RelPath.from('missing.txt'),
    root: 'scene',
  },
  code: 'missing-resource',
  field: { kind: 'choice', index: 1 },
  severity: 'error',
  source: 'resource',
  value: 'missing.txt',
}

describe('StatementSpecialContentEditor', () => {
  it('panel 中 setVar 编辑器独占整行并让输入框占满宽度', () => {
    renderInBrowser(StatementSpecialContentEditor, {
      props: {
        surface: 'panel',
        mode: 'setVar',
        setVarContent: { name: 'score', value: '1' },
        chooseItems: [],
        styleRuleItems: [],
        sceneRootPath: '',
        getChoiceDiagnostics: () => [],
      },
      global: {
        stubs: {
          ...globalStubs,
          Input,
        },
      },
    })

    const editor = document.querySelector<HTMLElement>('[data-statement-set-var-editor]')
    const inputs = document.querySelectorAll<HTMLInputElement>('[data-statement-set-var-editor] input')
    expect(editor).toHaveClass('w-full', 'shrink-0')
    expect(inputs).toHaveLength(2)

    const editorWidth = editor?.getBoundingClientRect().width ?? 0
    for (const input of inputs) {
      expect(input.getBoundingClientRect().width).toBeCloseTo(editorWidth, 0)
    }
  })

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
        getChoiceDiagnostics: () => [],
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

  it.each(['inline', 'panel'] as const)('在 %s 中只标记诊断对应的 choose 文件控件', (surface) => {
    renderInBrowser(StatementSpecialContentEditor, {
      props: {
        surface,
        mode: 'choose',
        setVarContent: { name: '', value: '' },
        chooseItems: [
          { name: '继续', file: 'next.txt' },
          { name: '返回', file: 'missing.txt' },
        ],
        styleRuleItems: [],
        sceneRootPath: '',
        getChoiceDiagnostics: (index: number) => index === 1 ? [missingChoiceDiagnostic] : [],
      },
      global: {
        stubs: globalStubs,
      },
    })

    const inputs = document.querySelectorAll<HTMLInputElement>('[placeholder="edit.visualEditor.filePicker.scene"]')
    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toHaveAttribute('status', 'none')
    expect(inputs[1]).toHaveAttribute('status', 'error')
  })
})
