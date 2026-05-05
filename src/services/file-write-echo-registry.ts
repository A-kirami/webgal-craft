import { normalizeFsPath } from '~/utils/path'

interface PendingFileWrite {
  id: number
  bytes: Uint8Array
  expiresAt: number
  cleanupTimer: ReturnType<typeof setTimeout>
}

export interface PendingFileWriteHandle {
  physicalPath: string
  id: number
}

const PENDING_FILE_WRITE_TTL_MS = 30 * 1000

const pendingFileWrites = new Map<string, PendingFileWrite[]>()
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

function normalizePhysicalPath(path: string): string {
  return normalizeFsPath(path)
}

function pruneExpiredPendingFileWrites(path: string, now: number = Date.now()): void {
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

export function registerPendingFileWrite(physicalPath: string, bytes: Uint8Array): PendingFileWriteHandle {
  const normalizedPath = normalizePhysicalPath(physicalPath)
  const now = Date.now()
  pruneExpiredPendingFileWrites(normalizedPath, now)

  const pendingWriteId = nextPendingFileWriteId
  const cleanupTimer = setTimeout(() => {
    pruneExpiredPendingFileWrites(normalizedPath)
  }, PENDING_FILE_WRITE_TTL_MS)

  const pendingWrite: PendingFileWrite = {
    id: pendingWriteId,
    bytes: cloneBytes(bytes),
    expiresAt: now + PENDING_FILE_WRITE_TTL_MS,
    cleanupTimer,
  }
  nextPendingFileWriteId += 1

  const writes = pendingFileWrites.get(normalizedPath) ?? []
  writes.push(pendingWrite)
  pendingFileWrites.set(normalizedPath, writes)

  return {
    physicalPath: normalizedPath,
    id: pendingWrite.id,
  }
}

export function commitPendingFileWrite(handle: PendingFileWriteHandle): void {
  const normalizedPath = normalizePhysicalPath(handle.physicalPath)
  pruneExpiredPendingFileWrites(normalizedPath)

  const writes = pendingFileWrites.get(normalizedPath)
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
    pendingFileWrites.delete(normalizedPath)
    return
  }

  pendingFileWrites.set(normalizedPath, nextWrites)
}

export function rollbackPendingFileWrite(handle: PendingFileWriteHandle): void {
  const normalizedPath = normalizePhysicalPath(handle.physicalPath)
  const writes = pendingFileWrites.get(normalizedPath)
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
    pendingFileWrites.delete(normalizedPath)
    return
  }

  pendingFileWrites.set(normalizedPath, nextWrites)
}

export function hasPendingFileWrite(physicalPath: string): boolean {
  const normalizedPath = normalizePhysicalPath(physicalPath)
  pruneExpiredPendingFileWrites(normalizedPath)
  return (pendingFileWrites.get(normalizedPath)?.length ?? 0) > 0
}

export function matchesPendingFileWrite(physicalPath: string, bytes: Uint8Array): boolean {
  const normalizedPath = normalizePhysicalPath(physicalPath)
  pruneExpiredPendingFileWrites(normalizedPath)

  const writes = pendingFileWrites.get(normalizedPath)
  if (!writes || writes.length === 0) {
    return false
  }

  return writes.some(write => areBytesEqual(write.bytes, bytes))
}
