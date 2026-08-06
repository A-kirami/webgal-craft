import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { nextTick } from 'vue'

vi.mock('vue-router', () => ({
  useRoute: () => ({
    params: {},
    query: {},
    path: '/',
    name: '',
    meta: {},
  }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
}))
import {
  createBrowserClickStub,
  createBrowserContainerStub,
  createBrowserInputStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

import StatementEditorInline from './StatementEditorInline.vue'

import type { StatementEntry } from '~/domain/script/sentence'

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  Input: createBrowserInputStub('StubInput'),
  ParamRenderer: createBrowserContainerStub('StubParamRenderer'),
}

function createStatementEntry(): StatementEntry {
  return {
    id: 1,
    parseError: false,
    parsed: undefined,
    rawText: 'callScene:battle.txt;',
  }
}

describe('StatementEditorInline callScene parameters', () => {
  it('点击添加参数后保留可编辑的空参数行', async () => {
    const onUpdate = vi.fn()

    renderInBrowser(StatementEditorInline, {
      props: {
        entry: createStatementEntry(),
        onUpdate,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'edit.visualEditor.params.addParameter' }).click()
    await nextTick()

    expect(document.querySelectorAll('[placeholder="edit.visualEditor.params.parameterKey"]')).toHaveLength(1)
    expect(document.querySelectorAll('[placeholder="edit.visualEditor.params.parameterValue"]')).toHaveLength(1)
    await expect.element(page.getByText('=')).toBeInTheDocument()
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ rawText: 'callScene:battle.txt;' }))
  })
})
