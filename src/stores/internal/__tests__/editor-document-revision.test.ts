import { describe, expect, it } from 'vitest'

import { createDocumentModel } from '~/domain/document/document-model'
import { LATEST_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'
import { AbsPath } from '~/domain/path'

import {
  createSceneBufferRevision,
  createSceneContentChangeToken,
  hashDocumentContent,
} from '../editor-document-revision'
import { createLoadedDocumentState, invalidateDocumentTextCache } from '../editor-document-state'
import { createEditableSession } from '../editor-session'

import type { EditableEditorSession } from '../editor-session'

const SCENE_PATH = AbsPath.from('/game/scene/start.txt')

/** 参考实现：锁定哈希取值，更换算法会让已写入的 revision 失效 */
function referenceHash(content: string): string {
  let hash = 0
  for (const char of content) {
    hash = Math.trunc(Math.imul(31, hash) + (char.codePointAt(0) ?? 0)) % 2 ** 32
  }
  return hash.toString(16)
}

function createSceneSession(content: string): EditableEditorSession {
  return createEditableSession(
    SCENE_PATH,
    createLoadedDocumentState('scene', content, undefined, LATEST_ENGINE_RUNTIME_CAPABILITIES),
    'visual',
  )
}

describe('hashDocumentContent', () => {
  it('与逐码点参考实现逐位一致', () => {
    const corpus = [
      '',
      'a',
      'say:hello;',
      '中文台词内容',
      '👨‍👩‍👧‍👦',
      '\uD800',
      '\uD800a',
      'a\uDC00',
      '𝄞 clef',
      '中文\n😀\n结尾',
      'say:👩‍🚀 -vocal=a.mp3;'.repeat(50),
    ]

    for (const content of corpus) {
      expect(hashDocumentContent(content)).toBe(referenceHash(content))
    }
  })

  it('长度相同但内容不同的文本给出不同取值', () => {
    expect(hashDocumentContent('Alice:hello;')).not.toBe(hashDocumentContent('Alice:world;'))
  })
})

describe('场景 buffer 内容标识', () => {
  it('内容变化后变更令牌与 revision 都变化', () => {
    const session = createSceneSession('Alice:hello;')
    const tokenBefore = createSceneContentChangeToken(session)
    const revisionBefore = createSceneBufferRevision(session)

    session.document.model = createDocumentModel({
      kind: 'scene',
      content: 'Alice:hello, world;',
      runtimeCapabilities: LATEST_ENGINE_RUNTIME_CAPABILITIES,
    })
    invalidateDocumentTextCache(session.document)

    expect(createSceneContentChangeToken(session)).not.toBe(tokenBefore)
    expect(createSceneBufferRevision(session)).not.toBe(revisionBefore)
  })

  it('长度相同的不同内容也能被 revision 区分', () => {
    // revision 是外部重构的并发令牌，不能退化成计数器或长度比较
    expect(createSceneBufferRevision(createSceneSession('Alice:hello;')))
      .not.toBe(createSceneBufferRevision(createSceneSession('Alice:world;')))
  })

  it('文本投影草稿的内容变化反映在变更令牌中', () => {
    const session = createSceneSession('Alice:hello;')
    session.textState.textSource = 'draft'
    const tokenBefore = createSceneContentChangeToken(session)

    session.textState.textContent = '{invalid'

    expect(createSceneContentChangeToken(session)).not.toBe(tokenBefore)
  })

  it('仅替换文档模型（外部重构路径）也会推进变更令牌', () => {
    const session = createSceneSession('Alice:hello;')
    const tokenBefore = createSceneContentChangeToken(session)

    // 外部重构路径：只替换模型并失效文本缓存，不提交事务
    session.document.model = createDocumentModel({
      kind: 'scene',
      content: 'Alice:hello;',
      runtimeCapabilities: LATEST_ENGINE_RUNTIME_CAPABILITIES,
    })
    invalidateDocumentTextCache(session.document)

    expect(createSceneContentChangeToken(session)).not.toBe(tokenBefore)
  })
})
