import { describe, expect, it } from 'vitest'

import {
  createDocumentState,
  createLoadedDocumentState,
  isDocumentDirty,
  markDocumentClean,
  resolveSceneCursor,
} from '../editor-document-state'
import {
  applyLoadedDocumentState,
  createEditableSession,
  syncProjectionStateFromDocument,
} from '../editor-session'

describe('编辑器会话的已加载文档状态', () => {
  it('即使偏好可视模式，非法动画草稿仍保留显式文本快照', () => {
    const loadedState = createLoadedDocumentState('animation', '{invalid json')

    expect(loadedState.textProjection).toEqual({
      content: '{invalid json',
      source: 'draft',
      syncError: 'invalid-animation-json',
    })

    const session = createEditableSession('/game/animation/broken.json', loadedState, 'visual')

    expect(session.activeProjection).toBe('visual')
    expect(session.textState.textContent).toBe('{invalid json')
    expect(session.textState.textSource).toBe('draft')
    expect(session.textState.syncError).toBe('invalid-animation-json')
  })

  it('有效动画草稿仅在文本模式下保留', () => {
    const content = '[{"duration":100}]'
    const loadedState = createLoadedDocumentState('animation', content)

    const visualSession = createEditableSession('/game/animation/visual.json', loadedState, 'visual')
    expect(visualSession.activeProjection).toBe('visual')
    expect(visualSession.textState.textSource).toBe('projection')
    expect(visualSession.textState.syncError).toBeUndefined()

    const textSession = createEditableSession('/game/animation/text.json', loadedState, 'text')
    expect(textSession.activeProjection).toBe('text')
    expect(textSession.textState.textContent).toBe(content)
    expect(textSession.textState.textSource).toBe('draft')
  })

  it('applyLoadedDocumentState 会从显式快照恢复文本投影', () => {
    const session = createEditableSession(
      '/game/animation/state.json',
      createLoadedDocumentState('animation', '[{"duration":100}]'),
      'visual',
    )

    const invalidLoadedState = createLoadedDocumentState('animation', '{broken')
    applyLoadedDocumentState(session, invalidLoadedState, 'text')

    expect(session.activeProjection).toBe('text')
    expect(session.textState.textContent).toBe('{broken')
    expect(session.textState.textSource).toBe('draft')
    expect(session.textState.syncError).toBe('invalid-animation-json')
  })

  it('偏好可视模式时，applyLoadedDocumentState 会为非法动画草稿保持可视投影激活', () => {
    const session = createEditableSession(
      '/game/animation/state.json',
      createLoadedDocumentState('animation', '[{"duration":100}]'),
      'visual',
    )

    applyLoadedDocumentState(session, createLoadedDocumentState('animation', '{broken'), 'visual')

    expect(session.activeProjection).toBe('visual')
    expect(session.textState.textContent).toBe('{broken')
    expect(session.textState.textSource).toBe('draft')
    expect(session.textState.syncError).toBe('invalid-animation-json')
  })

  it('applyLoadedDocumentState 会在同步非法动画草稿前清理陈旧脏状态', () => {
    const session = createEditableSession(
      '/game/animation/reload.json',
      createLoadedDocumentState('animation', '[{"duration":100}]'),
      'text',
    )

    session.textState.isDirty = true

    applyLoadedDocumentState(session, createLoadedDocumentState('animation', '{broken'), 'text')
    syncProjectionStateFromDocument(session.document, session.textState, session.visualState)

    expect(session.textState.syncError).toBe('invalid-animation-json')
    expect(session.textState.isDirty).toBe(false)
  })

  it('resolveSceneCursor 会移除 CRLF 内容中的回车符', () => {
    expect(resolveSceneCursor('first\r\nsecond\r\nthird', 2)).toEqual({
      lineNumber: 2,
      lineText: 'second',
    })
  })

  it('无需额外包装类也能根据已保存序号跟踪脏状态', () => {
    const document = createDocumentState(createLoadedDocumentState('plaintext', 'alpha').model)

    document.engine.commit(
      { type: 'replace-all', content: 'beta' },
      { type: 'replace-all', content: 'alpha' },
      'text',
    )
    markDocumentClean(document)
    document.engine.markBoundary()

    document.engine.commit(
      { type: 'replace-all', content: 'gamma' },
      { type: 'replace-all', content: 'beta' },
      'text',
    )
    expect(isDocumentDirty(document)).toBe(true)

    document.engine.undo()
    expect(isDocumentDirty(document)).toBe(false)
  })
})
