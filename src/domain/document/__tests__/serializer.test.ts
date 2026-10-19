import { describe, expect, it } from 'vitest'

import { createDocumentModel } from '../document-model'
import { serializeDocument } from '../serializer'

describe('serializeDocument', () => {
  it('场景文档序列化时保持原始 CRLF', () => {
    const model = createDocumentModel({
      kind: 'scene',
      content: 'foo\r\nbar',
    })

    expect(serializeDocument(model)).toBe('foo\r\nbar')
  })

  it('纯文本文档序列化时保持原始 CRLF', () => {
    const model = createDocumentModel({
      kind: 'plaintext',
      content: 'alpha\r\nbeta',
    })

    expect(serializeDocument(model)).toBe('alpha\r\nbeta')
  })

  it('v2 动画文档保留原文，不按帧数组重写', () => {
    const content = [
      '{',
      '  "version": 2,',
      '  "relative": true,',
      '  "inherit": false,',
      '  "relativeCalc": {',
      '    "position": "add"',
      '  },',
      '  "keyframes": [',
      '    {',
      '      "time": 0,',
      '      "alpha": 0',
      '    }',
      '  ]',
      '}',
    ].join('\n')
    const model = createDocumentModel({
      kind: 'animation',
      content,
    })

    expect(model).toMatchObject({
      content,
      format: 'v2-object',
      kind: 'animation',
    })
    expect(serializeDocument(model)).toBe(content)
  })
})
