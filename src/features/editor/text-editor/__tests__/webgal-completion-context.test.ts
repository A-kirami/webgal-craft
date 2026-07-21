import { describe, expect, it } from 'vitest'

import { resolveWebgalArgumentCompletionTarget } from '~/features/editor/text-editor/webgal-completion-context'

describe('resolveWebgalArgumentCompletionTarget', () => {
  it('只在首个参数带连字符时返回参数键上下文', () => {
    const contentLine = 'Alice: hello fi'
    expect(resolveWebgalArgumentCompletionTarget(contentLine, contentLine.length)).toEqual({ kind: 'none' })

    const argumentLine = 'Alice: hello -fi'
    expect(resolveWebgalArgumentCompletionTarget(argumentLine, argumentLine.length)).toEqual({
      kind: 'key',
      hasLeadingDash: true,
      startOffset: argumentLine.length - 2,
      endOffset: argumentLine.length,
    })
  })

  it('进入参数区后允许裸键并要求补全项补上连字符', () => {
    const line = 'Alice: hello -fontSize=12 fi'

    expect(resolveWebgalArgumentCompletionTarget(line, line.length)).toEqual({
      kind: 'key',
      hasLeadingDash: false,
      startOffset: line.length - 2,
      endOffset: line.length,
    })
  })

  it('孤立连字符不会把后续普通文本误判为参数键', () => {
    const line = 'Alice: hello - world'

    expect(resolveWebgalArgumentCompletionTarget(line, line.length)).toEqual({ kind: 'none' })
  })

  it('光标位于参数键中间时替换完整键和已有等号', () => {
    const line = 'Alice: hello -figureId='
    const cursorOffset = line.indexOf('Id')

    expect(resolveWebgalArgumentCompletionTarget(line, cursorOffset)).toEqual({
      kind: 'key',
      hasLeadingDash: true,
      startOffset: line.indexOf('figureId'),
      endOffset: line.length,
    })
  })

  it('识别空值和已输入前缀的参数值上下文', () => {
    const emptyValueLine = 'Alice: hello -figureId='
    expect(resolveWebgalArgumentCompletionTarget(emptyValueLine, emptyValueLine.length)).toEqual({
      kind: 'value',
      key: 'figureId',
      prefix: '',
      startOffset: emptyValueLine.length,
    })

    const prefixedValueLine = 'Alice: hello -figureId=he'
    expect(resolveWebgalArgumentCompletionTarget(prefixedValueLine, prefixedValueLine.length)).toEqual({
      kind: 'value',
      key: 'figureId',
      prefix: 'he',
      startOffset: prefixedValueLine.length - 2,
    })
  })
})
