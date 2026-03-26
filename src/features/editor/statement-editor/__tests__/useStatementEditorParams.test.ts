import '~/__tests__/mocks/i18n'
import '~/__tests__/mocks/router'
import '~/__tests__/mocks/tauri-fs'
import '~/__tests__/mocks/modal-store'

import { beforeEach, describe, expect, it } from 'vitest'
import { computed, ref } from 'vue'

import { mustParse } from '~/domain/script/__tests__/utils'
import { parseCommandNode } from '~/domain/script/codec'
import {
  createHarness,
  requireArgField,
  resetStatementEditorRuntime,
  workspaceStoreState,
} from '~/features/editor/__tests__/statement-editor-test-utils'
import { CUSTOM_CONTENT } from '~/features/editor/command-registry/schema'
import { registerDynamicOptions } from '~/features/editor/dynamic-options/dynamic-options'
import { useStatementEditorParams } from '~/features/editor/statement-editor/useStatementEditorParams'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { ArgField } from '~/features/editor/command-registry/schema'

describe('useStatementEditor 参数行为', () => {
  beforeEach(() => {
    resetStatementEditorRuntime()
  })

  it('动态选项解析会携带当前语句内容和工作区路径', () => {
    workspaceStoreState.CWD = '/mock/game'
    const { editor } = createHarness('changeBg: bg.jpg;')
    let receivedContext: { content: string, gamePath: string } | undefined

    registerDynamicOptions('animationTableEntries', (context) => {
      receivedContext = context
      return {
        options: [{ label: 'fade', value: 'fade' }],
        loading: false,
      }
    })

    const dynamicField: ArgField = {
      storageKey: 'enter',
      field: {
        key: 'enter',
        type: 'choice',
        label: 'enter',
        dynamicOptionsKey: 'animationTableEntries',
        options: [],
      },
    } as const

    expect(editor.params.getArgDynamicOptions(dynamicField)).toEqual([
      { label: 'fade', value: 'fade' },
    ])
    expect(receivedContext).toEqual({
      content: 'bg.jpg',
      gamePath: '/mock/game',
    })
  })

  it('flattened json 参数会回写到同一个父级 arg 对象中', () => {
    const { editor, updates } = createHarness('changeFigure: figure.json;')
    const focusXField = requireArgField(editor, 'focus.x')
    const focusYField = requireArgField(editor, 'focus.y')

    editor.params.handleArgFieldChange(focusXField, '0.2')
    editor.params.handleArgFieldChange(focusYField, '-0.3')

    expect(updates.at(-1)?.parsed.args).toEqual([
      { key: 'focus', value: '{"x":0.2,"y":-0.3}' },
    ])
  })

  it('customizable select 在自定义值时会暴露 CUSTOM_CONTENT token', () => {
    const { editor } = createHarness('setAnimation: bounce -target=node-custom;')
    const targetField = requireArgField(editor, 'target')

    expect(editor.params.getArgSelectValue(targetField)).toBe(CUSTOM_CONTENT)
    expect(editor.params.isArgCustom(targetField)).toBe(true)
  })

  it('控制参数变化后会裁剪已经隐藏的依赖参数', () => {
    const { editor, updates } = createHarness('changeBg: bg.jpg -enter=fadeIn -enterDuration=200;')
    const enterField = requireArgField(editor, 'enter')

    editor.params.handleArgFieldChange(enterField, 'zoomIn')

    expect(updates.at(-1)?.parsed.args).toEqual([
      { key: 'enter', value: 'zoomIn' },
    ])
  })

  it('无冒号 say 清空最后一个参数时会直接回写规范化后的 commandRaw', () => {
    const emittedPatches: Partial<ISentence>[] = []
    const sentence = mustParse(' -concat;')
    const concatField: ArgField = {
      storageKey: 'concat',
      field: {
        key: 'concat',
        type: 'switch',
        label: 'concat',
      },
    }
    const params = useStatementEditorParams({
      parsed: computed(() => sentence),
      commandNode: computed(() => parseCommandNode(sentence)),
      argFields: computed(() => [concatField]),
      fileMissingKeys: ref(new Set<string>()),
      readEditableArgs: () => structuredClone(sentence.args),
      emitUpdate: patch => emittedPatches.push(patch),
    })

    params.handleArgFieldChange(concatField, false)

    expect(emittedPatches).toEqual([{
      commandRaw: 'say',
      content: '',
      args: [],
    }])
  })
})
