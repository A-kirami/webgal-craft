import '~/__tests__/mocks/i18n'
import '~/__tests__/mocks/router'
import '~/__tests__/mocks/tauri-fs'
import '~/__tests__/mocks/modal-store'

import { beforeEach, describe, expect, it } from 'vitest'
import { computed } from 'vue'

import { mustParse } from '~/domain/script/__tests__/utils'
import { parseCommandNode } from '~/domain/script/codec'
import { stringifySetVarContent } from '~/domain/script/content'
import { createHarness, createReactiveHarness, resetStatementEditorRuntime } from '~/features/editor/__tests__/statement-editor-test-utils'
import { useStatementEditorContent } from '~/features/editor/statement-editor/useStatementEditorContent'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { EditorField } from '~/features/editor/command-registry/schema'

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

  it('choose 删除默认分支时清除 defaultChoose', () => {
    const { editor, updates } = createHarness('choose:a:a.txt|b:b.txt -defaultChoose=2;')

    editor.content.specialContent.handleRemoveChooseItem(1)

    expect(updates.at(-1)?.rawText).toBe('choose:a:a.txt;')
  })

  it('choose 删除默认分支之前的分支时递减 defaultChoose', () => {
    const { editor, updates } = createHarness('choose:a:a.txt|b:b.txt|c:c.txt -defaultChoose=3;')

    editor.content.specialContent.handleRemoveChooseItem(0)

    expect(updates.at(-1)?.rawText).toBe('choose:b:b.txt|c:c.txt -defaultChoose=2;')
  })

  it('choose 可设置、替换并取消默认分支', () => {
    const { editor, updates } = createReactiveHarness('choose:a:a.txt|b:b.txt;')

    editor.content.specialContent.handleChooseDefaultChange(1)
    expect(updates.at(-1)?.rawText).toBe('choose:a:a.txt|b:b.txt -defaultChoose=2;')
    expect(editor.content.specialContent.defaultChooseIndex.value).toBe(1)

    editor.content.specialContent.handleChooseDefaultChange(0)
    expect(updates.at(-1)?.rawText).toBe('choose:a:a.txt|b:b.txt -defaultChoose=1;')
    expect(editor.content.specialContent.defaultChooseIndex.value).toBe(0)

    editor.content.specialContent.handleChooseDefaultChange(0)
    expect(updates.at(-1)?.rawText).toBe('choose:a:a.txt|b:b.txt;')
    expect(editor.content.specialContent.defaultChooseIndex.value).toBeUndefined()
  })

  it('choose 忽略不存在分支的默认切换', () => {
    const { editor, updates } = createHarness('choose:a:a.txt|b:b.txt;')

    editor.content.specialContent.handleChooseDefaultChange(2)

    expect(updates).toEqual([])
  })

  it('更换立绘类型时保留所有隐藏参数和未管理参数', () => {
    const { editor, updates } = createHarness('changeFigure:hero.json?type=spine -motion=idle -skin=winter -eyesHalfOpen=half;note')

    editor.content.handleChange('hero.png')

    expect(updates.at(-1)?.rawText).toBe('changeFigure:hero.png -motion=idle -skin=winter -eyesHalfOpen=half;note')
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
