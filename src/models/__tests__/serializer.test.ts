import { describe, expect, it } from 'vitest'

import { createDocumentModel } from '../document-model'
import { serializeDocument } from '../serializer'

describe('serializer', () => {
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
})
