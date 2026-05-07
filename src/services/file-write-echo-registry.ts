import type { AbsPath } from '~/domain/path'

interface PendingFileWrite {
  id: number
  bytes: Uint8Array
  expiresAt: number
  cleanupTimer: ReturnType<typeof setTimeout>
}

export interface PendingFileWriteHandle {
  physicalPath: AbsPath
  id: number
}

const PENDING_FILE_WRITE_TTL_MS = 30 * 1000

const pendingFileWrites = new Map<AbsPath, PendingFileWrite[]>()
let nextPendingFileWriteId = 0

function cloneBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes)
}

function areBytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false
  }

  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

function pruneExpiredPendingFileWrites(path: AbsPath, now: number = Date.now()): void {
  const writes = pendingFileWrites.get(path)
  if (!writes) {
    return
  }

  const expiredWrites = writes.filter(write => write.expiresAt <= now)
  for (const write of expiredWrites) {
    clearTimeout(write.cleanupTimer)
  }

  const nextWrites = writes.filter(write => write.expiresAt > now)
  if (nextWrites.length === 0) {
    pendingFileWrites.delete(path)
    return
  }

  pendingFileWrites.set(path, nextWrites)
}

export function registerPendingFileWrite(physicalPath: AbsPath, bytes: Uint8Array): PendingFileWriteHandle {
  const now = Date.now()
  pruneExpiredPendingFileWrites(physicalPath, now)

  const pendingWriteId = nextPendingFileWriteId
  const cleanupTimer = setTimeout(() => {
    pruneExpiredPendingFileWrites(physicalPath)
  }, PENDING_FILE_WRITE_TTL_MS)

  const pendingWrite: PendingFileWrite = {
    id: pendingWriteId,
    bytes: cloneBytes(bytes),
    expiresAt: now + PENDING_FILE_WRITE_TTL_MS,
    cleanupTimer,
  }
  nextPendingFileWriteId += 1

  const writes = pendingFileWrites.get(physicalPath) ?? []
  writes.push(pendingWrite)
  pendingFileWrites.set(physicalPath, writes)

  return {
    physicalPath,
    id: pendingWrite.id,
  }
}

export function commitPendingFileWrite(handle: PendingFileWriteHandle): void {
  pruneExpiredPendingFileWrites(handle.physicalPath)

  const writes = pendingFileWrites.get(handle.physicalPath)
  if (!writes) {
    return
  }

  const nextWrites = writes.filter((write) => {
    if (write.id < handle.id) {
      clearTimeout(write.cleanupTimer)
      return false
    }

    return true
  })
  if (nextWrites.length === 0) {
    pendingFileWrites.delete(handle.physicalPath)
    return
  }

  pendingFileWrites.set(handle.physicalPath, nextWrites)
}

export function rollbackPendingFileWrite(handle: PendingFileWriteHandle): void {
  const writes = pendingFileWrites.get(handle.physicalPath)
  if (!writes) {
    return
  }

  for (const write of writes) {
    if (write.id === handle.id) {
      clearTimeout(write.cleanupTimer)
    }
  }
  const nextWrites = writes.filter(write => write.id !== handle.id)
  if (nextWrites.length === 0) {
    pendingFileWrites.delete(handle.physicalPath)
    return
  }

  pendingFileWrites.set(handle.physicalPath, nextWrites)
}

export function hasPendingFileWrite(physicalPath: AbsPath): boolean {
  pruneExpiredPendingFileWrites(physicalPath)
  return (pendingFileWrites.get(physicalPath)?.length ?? 0) > 0
}

export function matchesPendingFileWrite(physicalPath: AbsPath, bytes: Uint8Array): boolean {
  pruneExpiredPendingFileWrites(physicalPath)

  const writes = pendingFileWrites.get(physicalPath)
  if (!writes || writes.length === 0) {
    return false
  }

  return writes.some(write => areBytesEqual(write.bytes, bytes))
}
