import type { TextMetadata } from '~/models/document-model'

interface PendingDocumentWrite {
  content: string
  metadata: TextMetadata
  expiresAt: number
}

/**
 * 仅用于清理长期未消费的写入意图，避免内存常驻。
 * “是否为自写入回声”由 content + metadata 精确匹配决定，不依赖该时间窗。
 */
const PENDING_DOCUMENT_WRITE_TTL_MS = 30 * 1000

const pendingDocumentWrites = new Map<string, PendingDocumentWrite[]>()

function isSameTextMetadata(left: TextMetadata, right: TextMetadata): boolean {
  return left.encoding === right.encoding && left.lineEnding === right.lineEnding
}

function pruneExpiredPendingWrites(path: string, now: number = Date.now()) {
  const writes = pendingDocumentWrites.get(path)
  if (!writes) {
    return
  }

  const nextWrites = writes.filter(write => write.expiresAt > now)
  if (nextWrites.length === 0) {
    pendingDocumentWrites.delete(path)
    return
  }

  pendingDocumentWrites.set(path, nextWrites)
}

export function registerPendingDocumentWrite(path: string, content: string, metadata: TextMetadata) {
  const now = Date.now()
  pruneExpiredPendingWrites(path, now)

  const writes = pendingDocumentWrites.get(path) ?? []
  writes.push({
    content,
    metadata: { ...metadata },
    expiresAt: now + PENDING_DOCUMENT_WRITE_TTL_MS,
  })
  pendingDocumentWrites.set(path, writes)
}

export function consumePendingDocumentWrite(path: string, content: string, metadata: TextMetadata): boolean {
  const now = Date.now()
  pruneExpiredPendingWrites(path, now)

  const writes = pendingDocumentWrites.get(path)
  if (!writes || writes.length === 0) {
    return false
  }

  const matchIndex = writes.findIndex(write =>
    write.content === content && isSameTextMetadata(write.metadata, metadata),
  )

  if (matchIndex === -1) {
    return false
  }

  writes.splice(matchIndex, 1)
  if (writes.length === 0) {
    pendingDocumentWrites.delete(path)
  }

  return true
}
