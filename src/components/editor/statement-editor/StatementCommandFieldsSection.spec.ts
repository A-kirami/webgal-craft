import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'

import { createBrowserClickStub, createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'

import StatementCommandFieldsSection from './StatementCommandFieldsSection.vue'

import type { StatementParamRendererSharedProps, StatementSpecialContentBindings } from './types'

function createSpecialContentBindings(): StatementSpecialContentBindings {
  return {
    choose: { value: [] },
    setVar: { value: { name: '', value: '' } },
    styleRules: { value: [] },
    handleSetVarNameChange: () => { /* no-op */ },
    handleSetVarValueChange: () => { /* no-op */ },
    handleChooseNameChange: () => { /* no-op */ },
    handleChooseFileChange: () => { /* no-op */ },
    handleRemoveChooseItem: () => { /* no-op */ },
    handleAddChooseItem: () => { /* no-op */ },
    handleStyleOldNameChange: () => { /* no-op */ },
    handleStyleNewNameChange: () => { /* no-op */ },
    handleRemoveStyleRule: () => { /* no-op */ },
    handleAddStyleRule: () => { /* no-op */ },
  }
}

function createParamRendererSharedProps(): StatementParamRendererSharedProps {
  return {
    canScrub: () => false,
    fileRootPaths: {},
    getDynamicOptions: () => [],
    getFieldSelectValue: () => '',
    getFieldValue: () => '',
    isFieldCustom: () => false,
    isFieldFileMissing: () => false,
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
    renderInBrowser(StatementCommandFieldsSection, {
      props: {
        surface: 'inline',
        statementType: 'command',
        basicRenderFields: [],
        showAnimationEditorButton: false,
        showEffectEditorButton: false,
        effectEditorAtTop: true,
        specialContent: createSpecialContentBindings(),
        sceneRootPath: '',
        paramRendererSharedProps: createParamRendererSharedProps(),
        customOptionLabel: 'Custom',
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
    renderInBrowser(StatementCommandFieldsSection, {
      props: {
        surface: 'inline',
        statementType: 'command',
        basicRenderFields: [],
        showAnimationEditorButton: false,
        showEffectEditorButton: true,
        effectEditorAtTop: true,
        specialContent: createSpecialContentBindings(),
        sceneRootPath: '',
        paramRendererSharedProps: createParamRendererSharedProps(),
        customOptionLabel: 'Custom',
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
