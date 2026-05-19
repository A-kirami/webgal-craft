import '~/__tests__/mocks/i18n'
import '~/__tests__/mocks/router'
import '~/__tests__/mocks/tauri-fs'
import '~/__tests__/mocks/modal-store'

import { beforeEach, describe, expect, it } from 'vitest'
import { computed } from 'vue'

import { mustParse } from '~/domain/script/__tests__/utils'
import { parseCommandNode } from '~/domain/script/codec'
import { stringifySetVarContent } from '~/domain/script/content'
import { createHarness, resetStatementEditorRuntime } from '~/features/editor/__tests__/statement-editor-test-utils'
import { CUSTOM_CONTENT } from '~/features/editor/command-registry/schema'
import { registerDynamicOptions } from '~/features/editor/dynamic-options/dynamic-options'
import { useStatementEditorContent } from '~/features/editor/statement-editor/useStatementEditorContent'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { ArgField, EditorField } from '~/features/editor/command-registry/schema'

describe('useStatementEditorContent', () => {
  beforeEach(() => {
    resetStatementEditorRuntime()
  })

  it('pipe/newline 会按 WebGAL 规则互转并保留转义管道符', () => {
    const { editor } = createHarness('say:hello;')

    expect(editor.content.pipeToNewline(String.raw`line1|line2\|literal`)).toBe('line1\nline2|literal')
    expect(editor.content.newlineToPipe('line1\nline2|literal')).toBe(String.raw`line1|line2\|literal`)
  })

  it('无冒号 say 编辑内容后不会回写 speaker 前缀', () => {
    const { editor, updates } = createHarness('hello world;')

    editor.content.handleChange('updated')

    expect(updates.at(-1)?.rawText).toBe('updated;')
  })

  it('无冒号 say 清空内容时会直接回写规范化后的 commandRaw', () => {
    const emittedPatches: Partial<ISentence>[] = []
    const sentence = mustParse('hello world;')
    const content = useStatementEditorContent({
      parsed: computed(() => sentence),
      commandNode: computed(() => parseCommandNode(sentence)),
      contentField: computed(() => undefined as EditorField | undefined),
      argFields: computed(() => [] as ArgField[]),
      emitUpdate: patch => emittedPatches.push(patch),
    })

    content.handleContentChange('')

    expect(emittedPatches).toEqual([{
      commandRaw: 'say',
      content: '',
      args: [],
    }])
  })

  it('setVar 特殊内容编辑会通过内容序列化回写', () => {
    const { editor, updates } = createHarness(`setVar:${stringifySetVarContent('score', '10')};`)

    editor.content.specialContent.handleSetVarValueChange('20')

    expect(updates.at(-1)?.rawText).toBe(`setVar:${stringifySetVarContent('score', '20')};`)
  })

  it('无静态选项的 content choice 会回显文本值和选择器写入值', () => {
    const { editor, updates } = createHarness('setAnimation: bounce;')
    const contentField = editor.contentField.value

    if (!contentField) {
      throw new TypeError('missing content field')
    }

    expect(editor.params.getFieldSelectValue(contentField)).toBe('bounce')

    editor.params.handleFieldSelectChange(contentField, 'flash')

    expect(updates.at(-1)?.parsed.content).toBe('flash')
    expect(editor.params.getFieldSelectValue(contentField)).toBe('flash')
  })

  it('customizable content choice 会用动态选项区分已知值和自定义值', () => {
    registerDynamicOptions('animationTableEntries', () => ({
      options: [
        { label: 'bounce', value: 'bounce' },
        { label: 'flash', value: 'flash' },
      ],
      loading: false,
    }))

    const dynamicContentField = {
      key: 'content',
      storage: 'content',
      field: {
        key: 'animation',
        type: 'choice',
        label: 'animation',
        customizable: true,
        dynamicOptionsKey: 'animationTableEntries',
        options: [],
      },
    } satisfies EditorField

    const knownSentence = mustParse('setAnimation: flash;')
    const knownContent = useStatementEditorContent({
      parsed: computed(() => knownSentence),
      commandNode: computed(() => parseCommandNode(knownSentence)),
      contentField: computed(() => dynamicContentField),
      argFields: computed(() => [] as ArgField[]),
      emitUpdate: () => { /* no-op */ },
    })

    const customSentence = mustParse('setAnimation: custom-motion;')
    const customContent = useStatementEditorContent({
      parsed: computed(() => customSentence),
      commandNode: computed(() => parseCommandNode(customSentence)),
      contentField: computed(() => dynamicContentField),
      argFields: computed(() => [] as ArgField[]),
      emitUpdate: () => { /* no-op */ },
    })

    expect(knownContent.contentSelectValue.value).toBe('flash')
    expect(customContent.contentSelectValue.value).toBe(CUSTOM_CONTENT)
  })

  it('多行 textarea 字段会被识别为 multiline', () => {
    const { editor } = createHarness('say:hello;')

    expect(editor.content.isMultilineTextField({
      key: 'body',
      type: 'text',
      label: 'body',
      variant: 'textarea-grow',
    })).toBe(true)
    expect(editor.content.isMultilineTextField({
      key: 'title',
      type: 'text',
      label: 'title',
      variant: 'input',
    })).toBe(false)
  })
})
