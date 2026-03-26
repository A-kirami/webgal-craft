/* eslint-disable vue/one-component-per-file */
import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'

import { createBrowserLiteI18n } from '~/__tests__/browser'

import StatementCommandFieldsSection from './StatementCommandFieldsSection.vue'

import type {
  StatementParamRendererSharedProps,
  StatementSpecialContentBindings,
} from './types'

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
  Button: defineComponent({
    name: 'StubButton',
    emits: ['click'],
    setup(_, { attrs, emit, slots }) {
      return () => h('button', {
        ...attrs,
        type: 'button',
        onClick: (event: MouseEvent) => emit('click', event),
      }, slots.default?.())
    },
  }),
  ParamRenderer: defineComponent({
    name: 'StubParamRenderer',
    setup() {
      return () => h('div')
    },
  }),
  StatementSpecialContentEditor: defineComponent({
    name: 'StubStatementSpecialContentEditor',
    setup() {
      return () => h('div')
    },
  }),
}

describe('StatementCommandFieldsSection', () => {
  it('顶部效果按钮受 showEffectEditorButton 控制', async () => {
    render(StatementCommandFieldsSection, {
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
        plugins: [createBrowserLiteI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('button', { name: 'edit.visualEditor.effectEditor' })).not.toBeInTheDocument()
  })

  it('顶部效果按钮在 showEffectEditorButton 为 true 时显示', async () => {
    render(StatementCommandFieldsSection, {
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
        plugins: [createBrowserLiteI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('button', { name: 'edit.visualEditor.effectEditor' })).toBeInTheDocument()
  })
})
