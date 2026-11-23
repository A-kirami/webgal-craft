// @unocss-safelist flex inline-flex flex-wrap flex-row flex-col items-center w-full w-24 w-auto field-sizing-content group-data-[surface=panel]:w-auto
import 'virtual:uno.css'

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
import { LATEST_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'

import StatementEditorInline from './StatementEditorInline.vue'
import StatementEditorPanel from './StatementEditorPanel.vue'

import type { StatementEntry } from '~/domain/script/sentence'

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  Input: createBrowserInputStub('StubInput'),
  ParamRenderer: createBrowserContainerStub('StubParamRenderer'),
}

function createStatementEntry(rawText = 'callScene:battle.txt;'): StatementEntry {
  return {
    id: 1,
    parseError: false,
    parsed: undefined,
    rawText,
    syntaxCapabilities: LATEST_ENGINE_RUNTIME_CAPABILITIES,
  }
}

describe('StatementEditorInline callScene parameters', () => {
  it.each([
    { surface: '内联', component: StatementEditorInline },
    { surface: '面板', component: StatementEditorPanel },
  ])('[$surface] 执行条件按普通文本参数布局并可编辑', async ({ component, surface }) => {
    const onUpdate = vi.fn()
    const { container } = await renderInBrowser(component, {
      props: {
        entry: createStatementEntry('callScene:battle.txt -when=false -enemy=slime;'),
        onUpdate,
      },
      browser: { i18nMode: 'localized' },
    })
    container.style.width = '640px'

    const condition = page.getByRole('textbox', { name: '执行条件' })
    await expect.element(condition).toHaveValue('false')
    const returnTarget = page.getByRole('textbox', { name: '返回值变量' })
    const returnField = returnTarget.element().closest('[data-layout]')
    const conditionField = condition.element().closest('[data-layout]')
    expect(conditionField?.previousElementSibling).toBe(returnField)
    const returnRect = returnTarget.element().getBoundingClientRect()
    const conditionRect = condition.element().getBoundingClientRect()
    if (surface === '内联') {
      expect(conditionRect.top).toBeGreaterThanOrEqual(returnRect.top - 1)
      expect(conditionRect.top).toBeLessThan(returnRect.bottom)
      expect(getComputedStyle(condition.element()).getPropertyValue('field-sizing')).toBe('fixed')
    } else {
      expect(conditionField?.getBoundingClientRect().width).toBeCloseTo(conditionRect.width, 0)
      expect(conditionRect.width).toBeCloseTo(returnRect.width, 0)
    }

    const expression = 'remainingHealth >= maximumHealth / 2'
    await condition.fill(expression)
    expect(condition.element().getBoundingClientRect().width).toBeCloseTo(conditionRect.width, 0)
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
      rawText: `callScene:battle.txt -when=${expression} -enemy=slime;`,
    }))
  })

  it('执行条件在高级参数折叠区之前显示', async () => {
    await renderInBrowser(StatementEditorInline, {
      props: { entry: createStatementEntry('changeFigure:hero.png;') },
    })

    const condition = page.getByRole('textbox', { name: 'edit.visualEditor.params.when' })
    const advanced = page.getByRole('button', { name: 'edit.visualEditor.advancedParams' })
    await expect.element(condition).toBeVisible()
    expect(condition.element().compareDocumentPosition(advanced.element()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('点击添加参数后保留可编辑的空参数行', async () => {
    const onUpdate = vi.fn()

    await renderInBrowser(StatementEditorInline, {
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

    await renderInBrowser(StatementEditorInline, {
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
