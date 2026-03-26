import { describe, expect, it } from 'vitest'

import { createDocumentModel } from '~/models/document-model'
import { serializeDocument } from '~/models/serializer'

import { createDocumentState, getDocumentTextContent, invalidateDocumentTextCache } from '../editor-document-state'

describe('getDocumentTextContent 行为', () => {
  it('首次调用时序列化并写入缓存', () => {
    const doc = createDocumentState(createDocumentModel({
      kind: 'plaintext',
      content: 'hello',
    }))

    expect(doc.cachedTextContent).toBeUndefined()

    const result = getDocumentTextContent(doc)

    expect(result).toBe('hello')
    expect(doc.cachedTextContent).toBe('hello')
  })

  it('缓存命中时直接返回缓存值', () => {
    const doc = createDocumentState(createDocumentModel({
      kind: 'plaintext',
      content: 'hello',
    }))

    // 首次调用填充缓存
    getDocumentTextContent(doc)

    // 手动篡改缓存以验证命中行为
    doc.cachedTextContent = 'cached-value'

    const result = getDocumentTextContent(doc)
    expect(result).toBe('cached-value')
  })

  it('invalidateDocumentTextCache 使缓存失效', () => {
    const doc = createDocumentState(createDocumentModel({
      kind: 'plaintext',
      content: 'hello',
    }))

    getDocumentTextContent(doc)
    expect(doc.cachedTextContent).toBe('hello')

    invalidateDocumentTextCache(doc)
    expect(doc.cachedTextContent).toBeUndefined()

    // 再次调用应重新序列化
    const result = getDocumentTextContent(doc)
    expect(result).toBe('hello')
  })

  it('与 serializeDocument 结果一致', () => {
    const model = createDocumentModel({
      kind: 'plaintext',
      content: 'line1\nline2\nline3',
    })
    const doc = createDocumentState(model)

    const cached = getDocumentTextContent(doc)
    const direct = serializeDocument(doc.model)

    expect(cached).toBe(direct)
  })
})
