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

  it('连续填写多个参数键时不会重排已有参数行', async () => {
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

    const addButton = page.getByRole('button', { name: 'edit.visualEditor.params.addParameter' })
    await addButton.click()
    await addButton.click()
    await addButton.click()

    await page.getByPlaceholder('edit.visualEditor.params.parameterKey').nth(1).fill('x')
    await page.getByPlaceholder('edit.visualEditor.params.parameterKey').nth(2).fill('xx')
    await page.getByPlaceholder('edit.visualEditor.params.parameterValue').nth(1).fill('second')
    await page.getByPlaceholder('edit.visualEditor.params.parameterValue').nth(2).fill('third')

    const keyValues = [...document.querySelectorAll<HTMLInputElement>(
      '[placeholder="edit.visualEditor.params.parameterKey"]',
    )].map(input => input.value)
    const valueValues = [...document.querySelectorAll<HTMLInputElement>(
      '[placeholder="edit.visualEditor.params.parameterValue"]',
    )].map(input => input.value)
    expect(keyValues).toEqual(['', 'x', 'xx'])
    expect(valueValues).toEqual(['', 'second', 'third'])
    expect(onUpdate.mock.lastCall?.[0].draftParsed?.args).toEqual([
      { key: '', value: '' },
      { key: 'x', value: 'second' },
      { key: 'xx', value: 'third' },
    ])
  })
})
