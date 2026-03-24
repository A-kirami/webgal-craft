import '~/__tests__/mocks/i18n'
import '~/__tests__/mocks/router'
import '~/__tests__/mocks/tauri-fs'
import '~/__tests__/mocks/modal-store'

import { beforeEach, describe, expect, it } from 'vitest'

import { stringifySetVarContent } from '~/helper/webgal-script/content'

import {
  createHarness,
  resetStatementEditorRuntime,
} from './statement-editor-test-utils'

describe('useStatementEditor 内容行为', () => {
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

  it('setVar 特殊内容编辑会通过内容序列化回写', () => {
    const { editor, updates } = createHarness(`setVar:${stringifySetVarContent('score', '10')};`)

    editor.content.specialContent.handleSetVarValueChange('20')

    expect(updates.at(-1)?.rawText).toBe(`setVar:${stringifySetVarContent('score', '20')};`)
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
