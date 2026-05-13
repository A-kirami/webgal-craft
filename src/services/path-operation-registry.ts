import type { AbsPath } from '~/domain/path'
import type { PathEchoMode } from '~/services/path-mutation'

export interface PendingPathOperation {
  id: number
  sourcePath: AbsPath
  targetPath: AbsPath
  expectedEchoes: number
}

export interface RegisterPathOperationInput {
  sourcePath: AbsPath
  targetPath: AbsPath
  ttlMs?: number
}

export interface UpdatePathOperationChannelInput {
  echoMode: PathEchoMode
  expectedEchoes: number
}

const DEFAULT_TTL_MS = 30 * 1000

const pendingPathOperations = new Map<number, PendingPathOperation>()
const cleanupTimers = new Map<number, ReturnType<typeof setTimeout>>()
let nextPendingPathOperationId = 1

function isPathWithinOrEqual(path: AbsPath, root: AbsPath): boolean {
  return path === root || path.startsWith(`${root}/`)
}

function hasPathOverlap(left: AbsPath, right: AbsPath): boolean {
  return isPathWithinOrEqual(left, right) || isPathWithinOrEqual(right, left)
}

function sameRelativeSuffix(
  oldPath: AbsPath,
  oldRoot: AbsPath,
  newPath: AbsPath,
  newRoot: AbsPath,
): boolean {
  if (!isPathWithinOrEqual(oldPath, oldRoot) || !isPathWithinOrEqual(newPath, newRoot)) {
    return false
  }

  const oldSuffix = oldPath === oldRoot ? '' : oldPath.slice(oldRoot.length + 1)
  const newSuffix = newPath === newRoot ? '' : newPath.slice(newRoot.length + 1)
  return oldSuffix === newSuffix
}

function clearCleanupTimer(id: number): void {
  const cleanupTimer = cleanupTimers.get(id)
  if (!cleanupTimer) {
    return
  }

  clearTimeout(cleanupTimer)
  cleanupTimers.delete(id)
}

function safeWarn(message: string): void {
  try {
    void logger.warn(message).catch(() => undefined)
  } catch {
    // 运行于非 Tauri 环境时，日志通道可能不可用。
  }
}

export function registerPathOperation(input: RegisterPathOperationInput): number {
  const id = nextPendingPathOperationId
  nextPendingPathOperationId += 1

  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS
  pendingPathOperations.set(id, {
    id,
    sourcePath: input.sourcePath,
    targetPath: input.targetPath,
    expectedEchoes: 0,
  })

  if (ttlMs > 0) {
    cleanupTimers.set(id, setTimeout(() => {
      const pending = pendingPathOperations.get(id)
      if (pending && pending.expectedEchoes > 0) {
        safeWarn(`路径操作回声超时，已释放 pending: ${pending.sourcePath} -> ${pending.targetPath}`)
      }
      releasePathOperation(id)
    }, ttlMs))
  }

  return id
}

export function updatePathOperationChannel(
  id: number,
  input: UpdatePathOperationChannelInput,
): boolean {
  const pending = pendingPathOperations.get(id)
  if (!pending) {
    return false
  }

  pending.expectedEchoes = Math.max(0, input.expectedEchoes)
  if (input.echoMode === 'synthetic') {
    clearCleanupTimer(id)
  }
  return true
}

export function releasePathOperation(id: number): boolean {
  clearCleanupTimer(id)
  return pendingPathOperations.delete(id)
}

function decrementPathOperationEcho(id: number): void {
  const pending = pendingPathOperations.get(id)
  if (!pending) {
    return
  }

  pending.expectedEchoes = Math.max(0, pending.expectedEchoes - 1)
  if (pending.expectedEchoes === 0) {
    releasePathOperation(id)
  }
}

export function hasOverlappingPathOperation(paths: readonly AbsPath[]): boolean {
  return [...pendingPathOperations.values()].some(pending =>
    paths.some(path =>
      hasPathOverlap(path, pending.sourcePath) || hasPathOverlap(path, pending.targetPath),
    ),
  )
}

function lookupPathOperationRenameEcho(
  oldPath: AbsPath,
  newPath: AbsPath,
): PendingPathOperation | undefined {
  return [...pendingPathOperations.values()].find(pending =>
    sameRelativeSuffix(oldPath, pending.sourcePath, newPath, pending.targetPath)
    || sameRelativeSuffix(oldPath, pending.targetPath, newPath, pending.sourcePath),
  )
}

function consumeRenamePathOperationEcho(oldPath: AbsPath, newPath: AbsPath): boolean {
  const pending = lookupPathOperationRenameEcho(oldPath, newPath)
  if (!pending) {
    return false
  }

  decrementPathOperationEcho(pending.id)
  return true
}

export function lookupPathOperationByPath(path: AbsPath): PendingPathOperation | undefined {
  return [...pendingPathOperations.values()].find(pending =>
    hasPathOverlap(path, pending.sourcePath) || hasPathOverlap(path, pending.targetPath),
  )
}

export function clearPendingPathOperations(): void {
  for (const id of pendingPathOperations.keys()) {
    clearCleanupTimer(id)
  }
  pendingPathOperations.clear()
  cleanupTimers.clear()
}

export const pathOperationRegistry = {
  register: registerPathOperation,
  updateChannel: updatePathOperationChannel,
  release: releasePathOperation,
  hasOverlap: hasOverlappingPathOperation,
  consumeRenameEcho: consumeRenamePathOperationEcho,
  lookupPathOperationByPath,
}
