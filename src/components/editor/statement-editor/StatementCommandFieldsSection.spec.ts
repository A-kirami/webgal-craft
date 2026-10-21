import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import { createBrowserClickStub, createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'

import StatementCommandFieldsSection from './StatementCommandFieldsSection.vue'

import type { StatementParamRendererSharedProps, StatementSpecialContentBindings } from './types'

function createSpecialContentBindings(): StatementSpecialContentBindings {
  return {
    choose: { value: [] },
    defaultChooseIndex: { value: undefined },
    setVar: { value: { name: '', value: '' } },
    styleRules: { value: [] },
    handleSetVarNameChange: () => { /* no-op */ },
    handleSetVarValueChange: () => { /* no-op */ },
    handleChooseNameChange: () => { /* no-op */ },
    handleChooseFileChange: () => { /* no-op */ },
    handleChooseDefaultChange: () => { /* no-op */ },
    handleRemoveChooseItem: () => { /* no-op */ },
    handleAddChooseItem: () => { /* no-op */ },
    handleStyleOldNameChange: () => { /* no-op */ },
    handleStyleNewNameChange: () => { /* no-op */ },
    handleRemoveStyleRule: () => { /* no-op */ },
    handleAddStyleRule: () => { /* no-op */ },
    getChoiceDiagnostics: () => [],
  }
}

function createParamRendererSharedProps(): StatementParamRendererSharedProps {
  return {
    canScrub: () => false,
    fileRootPaths: {},
    getAutocompleteOptions: () => [],
    getDynamicOptions: () => [],
    getFieldSelectOptions: () => [],
    supportsExtendedFigurePositions: false,
    getFieldSelectValue: () => '',
    getFieldValue: () => '',
    getFieldDiagnostics: () => [],
    isFieldVisible: () => true,
  }
}

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  ParamRenderer: createBrowserContainerStub('StubParamRenderer'),
  StatementSpecialContentEditor: createBrowserContainerStub('StubStatementSpecialContentEditor'),
}

describe('StatementCommandFieldsSection', () => {
  it('顶部效果按钮受 showEffectEditorButton 控制', async () => {
    await renderInBrowser(StatementCommandFieldsSection, {
      props: {
        surface: 'inline',
        statementType: 'command',
        basicRenderFields: [],
        showAnimationEditorButton: false,
        showAnimationFileEditorButton: false,
        animationFileEditorDisabled: false,
        showEffectEditorButton: false,
        effectEditorAtTop: true,
        specialContent: createSpecialContentBindings(),
        sceneRootPath: '',
        paramRendererSharedProps: createParamRendererSharedProps(),
        onUpdateValue: () => { /* no-op */ },
        onUpdateSelect: () => { /* no-op */ },
        onLabelPointerDown: () => { /* no-op */ },
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('button', { name: 'edit.visualEditor.effectEditor' })).not.toBeInTheDocument()
  })

  it('顶部效果按钮在 showEffectEditorButton 为 true 时显示', async () => {
    await renderInBrowser(StatementCommandFieldsSection, {
      props: {
        surface: 'inline',
        statementType: 'command',
        basicRenderFields: [],
        showAnimationEditorButton: false,
        showAnimationFileEditorButton: false,
        animationFileEditorDisabled: false,
        showEffectEditorButton: true,
        effectEditorAtTop: true,
        specialContent: createSpecialContentBindings(),
        sceneRootPath: '',
        paramRendererSharedProps: createParamRendererSharedProps(),
        onUpdateValue: () => { /* no-op */ },
        onUpdateSelect: () => { /* no-op */ },
        onLabelPointerDown: () => { /* no-op */ },
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('button', { name: 'edit.visualEditor.effectEditor' })).toBeInTheDocument()
  })
})
describe('StatementCommandFieldsSection 引用动画入口', () => {
  it('引用动画按钮受 showAnimationFileEditorButton 控制并转发打开事件', async () => {
    const onOpenAnimationFileEditor = vi.fn()
    await renderInBrowser(StatementCommandFieldsSection, {
      props: {
        surface: 'inline',
        statementType: 'command',
        basicRenderFields: [],
        showAnimationEditorButton: false,
        showAnimationFileEditorButton: true,
        animationFileEditorDisabled: false,
        showEffectEditorButton: false,
        effectEditorAtTop: true,
        specialContent: createSpecialContentBindings(),
        sceneRootPath: '',
        paramRendererSharedProps: createParamRendererSharedProps(),
        onUpdateValue: () => { /* no-op */ },
        onUpdateSelect: () => { /* no-op */ },
        onLabelPointerDown: () => { /* no-op */ },
        onOpenAnimationFileEditor,
      },
      global: {
        stubs: globalStubs,
      },
    })

    const button = page.getByRole('button', { name: 'edit.visualEditor.animation.title' })
    await expect.element(button).toBeInTheDocument()
    await button.click()

    expect(onOpenAnimationFileEditor).toHaveBeenCalledTimes(1)
  })

  it('没有动画名时按钮常驻但禁用，避免入口行高度变化', async () => {
    await renderInBrowser(StatementCommandFieldsSection, {
      props: {
        surface: 'inline',
        statementType: 'command',
        basicRenderFields: [],
        showAnimationEditorButton: false,
        showAnimationFileEditorButton: true,
        animationFileEditorDisabled: true,
        showEffectEditorButton: false,
        effectEditorAtTop: true,
        specialContent: createSpecialContentBindings(),
        sceneRootPath: '',
        paramRendererSharedProps: createParamRendererSharedProps(),
        onUpdateValue: () => { /* no-op */ },
        onUpdateSelect: () => { /* no-op */ },
        onLabelPointerDown: () => { /* no-op */ },
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('button', { name: 'edit.visualEditor.animation.title' })).toBeDisabled()
  })
})
