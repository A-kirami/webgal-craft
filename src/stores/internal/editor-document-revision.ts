import { getDocumentTextContent } from './editor-document-state'

import type { EditableEditorSession } from './editor-session'

const REVISION_HASH_MODULUS = 2 ** 32

/** 文本投影处于草稿态时取草稿，否则取文档序列化结果 */
export function getEffectiveSceneBufferContent(session: EditableEditorSession): string {
  return session.textState.textSource === 'draft'
    ? session.textState.textContent
    : getDocumentTextContent(session.document)
}

/**
 * 内容变更令牌：只读 Θ(1) 字段，供响应式消费者判断内容是否变化。
 *
 * 令牌必须覆盖全部内容变更路径：替换 model 推进 contentVersion，撤销/重做推进
 * historyRevision；文本投影草稿（非法动画 JSON）不落事务，因此一并带上 textSource、
 * syncError 与内容长度。
 */
export function createSceneContentChangeToken(session: EditableEditorSession): string {
  const { document, textState } = session
  return [
    document.contentVersion,
    document.historyRevision,
    document.engine.sequenceNumber,
    document.savedSequenceNumber,
    textState.textSource,
    textState.syncError ?? '',
    textState.textContent.length,
  ].join(':')
}

/**
 * 内容 revision：外部重构与回滚的乐观并发令牌，必须能区分任意两份不同内容，
 * 不能退化成计数器或长度比较。
 */
export function createSceneBufferRevision(session: EditableEditorSession): string {
  const content = getEffectiveSceneBufferContent(session)
  const { document, textState } = session
  return [
    document.historyRevision,
    document.engine.sequenceNumber,
    document.savedSequenceNumber,
    textState.textSource,
    content.length,
    hashDocumentContent(content),
  ].join(':')
}

/** 取值参与外部重构的并发令牌，算法不可更改 */
export function hashDocumentContent(content: string): string {
  let hash = 0
  for (const char of content) {
    hash = Math.trunc(Math.imul(31, hash) + (char.codePointAt(0) ?? 0)) % REVISION_HASH_MODULUS
  }
  return hash.toString(16)
}
