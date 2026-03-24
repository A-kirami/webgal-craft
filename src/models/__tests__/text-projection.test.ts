import { describe, expect, it, vi } from 'vitest'

vi.mock('../serializer', () => ({
  serializeDocument(model: { kind: string, content?: string, metadata: { lineEnding: '\n' | '\r\n' } }) {
    const content = model.kind === 'plaintext' || model.kind === 'template'
      ? (model.content ?? '')
      : ''
    return model.metadata.lineEnding === '\r\n'
      ? content.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n')
      : content
  },
}))

import { createDocumentModel } from '../document-model'
import { serializeDocument } from '../serializer'
import {
  applyTextContentToDocument,
  replaceDocumentText,
} from '../text-projection'

describe('文本投影', () => {
  it('对纯文本文档应用文本补丁后保留原始行尾符', () => {
    const model = createDocumentModel({
      kind: 'plaintext',
      content: 'foo\r\nbar',
    })

    const nextModel = applyTextContentToDocument(model, 'foo!\r\nbar')

    expect(serializeDocument(nextModel)).toBe('foo!\r\nbar')
    expect(nextModel.metadata.lineEnding).toBe('\r\n')
  })

  it('replace-all 会按 kind 重建纯文本模型', () => {
    const model = createDocumentModel({
      kind: 'plaintext',
      content: 'foo',
    })

    const nextModel = replaceDocumentText(model, 'alpha\nbeta')

    expect(nextModel.kind).toBe('plaintext')
    if (nextModel.kind !== 'plaintext') {
      throw new TypeError('expected plaintext document model')
    }

    expect(nextModel.content).toBe('alpha\nbeta')
    expect(serializeDocument(nextModel)).toBe('alpha\nbeta')
  })

  it('replace-all 合并传入 metadata，并保留未覆盖字段', () => {
    const model = createDocumentModel({
      kind: 'plaintext',
      content: 'foo',
      metadata: {
        lineEnding: '\n',
        encoding: 'utf-8-bom',
      },
    })

    const nextModel = replaceDocumentText(model, 'alpha\r\nbeta', {
      lineEnding: '\r\n',
    })

    expect(nextModel.metadata).toEqual({
      lineEnding: '\r\n',
      encoding: 'utf-8-bom',
    })
  })
})
