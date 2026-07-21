import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath, RelPath } from '~/domain/path'
import { useWorkspaceStore } from '~/stores/workspace'

const {
  fileSystemEventHandlers,
  openTabPaths,
} = vi.hoisted(() => ({
  fileSystemEventHandlers: new Map<string, (event: { oldPath?: string, newPath?: string, path?: string }) => void>(),
  openTabPaths: new Set<string>(),
}))

vi.mock('~/composables/useFileSystemEvents', () => ({
  useFileSystemEvents: () => ({
    on(event: string, handler: (payload: { oldPath?: string, newPath?: string, path?: string }) => void) {
      fileSystemEventHandlers.set(event, handler)
      return () => fileSystemEventHandlers.delete(event)
    },
  }),
}))

vi.mock('~/stores/workspace', async () => {
  const { reactive } = await import('vue')
  const state = reactive({
    currentGame: {
      id: 'game-1',
      path: '/games/demo',
    } as { id: string, path: string } | undefined,
  })
  return {
    useWorkspaceStore: () => state,
  }
})

vi.mock('~/stores/tabs', () => ({
  useTabsStore: () => ({
    findTabIndex: (path: string) => openTabPaths.has(path) ? 0 : -1,
  }),
}))

import { useEditorDiagnosticsStore } from '../editor-diagnostics'

import type { EditorDiagnostic } from '~/features/editor/diagnostics/types'

function setCurrentGame(id: string, path: AbsPath): void {
  const workspace = useWorkspaceStore() as unknown as {
    currentGame: { id: string, path: AbsPath } | undefined
  }
  workspace.currentGame = { id, path }
}

function duplicateLabelDiagnostic(statementIndex: number = 0): EditorDiagnostic {
  return {
    code: 'duplicate-label',
    count: 2,
    field: { kind: 'content' },
    label: 'start',
    severity: 'warning',
    source: 'scene',
    statementIndex,
  }
}

function missingResourceDiagnostic(): EditorDiagnostic {
  return {
    assetKey: {
      assetType: 'background',
      relativePath: RelPath.from('missing.png'),
      root: 'asset',
    },
    code: 'missing-resource',
    field: { kind: 'content' },
    severity: 'error',
    source: 'resource',
    statementIndex: 1,
    value: 'missing.png',
  }
}

describe('useEditorDiagnosticsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fileSystemEventHandlers.clear()
    openTabPaths.clear()
    setCurrentGame('game-1', AbsPath.from('/games/demo'))
  })

  it('按错误优先级聚合文档和语句的最高问题等级', () => {
    const store = useEditorDiagnosticsStore()
    const path = AbsPath.from('/games/demo/game/scene/start.txt')

    store.publish(path, [
      duplicateLabelDiagnostic(),
      missingResourceDiagnostic(),
    ])

    expect(store.getHighestSeverity(path)).toBe('error')
    expect(store.readStatementDiagnostics(path, 0)).toEqual([duplicateLabelDiagnostic()])
    expect(store.readStatementDiagnostics(path, 1)).toEqual([missingResourceDiagnostic()])
  })

  it('资源索引失效时只移除资源诊断并保留场景诊断', () => {
    const store = useEditorDiagnosticsStore()
    const path = AbsPath.from('/games/demo/game/scene/start.txt')

    store.publish(path, [duplicateLabelDiagnostic(), missingResourceDiagnostic()])
    store.invalidateSource('resource')

    expect(store.getHighestSeverity(path)).toBe('warning')
  })

  it('文件重命名和删除会同步迁移诊断', () => {
    const store = useEditorDiagnosticsStore()
    const oldPath = AbsPath.from('/games/demo/game/scene/start.txt')
    const newPath = AbsPath.from('/games/demo/game/scene/prologue.txt')

    store.publish(oldPath, [duplicateLabelDiagnostic()])

    fileSystemEventHandlers.get('file:renamed')?.({ oldPath, newPath })

    expect(store.getHighestSeverity(oldPath)).toBeUndefined()
    expect(store.getHighestSeverity(newPath)).toBe('warning')

    fileSystemEventHandlers.get('file:removed')?.({ path: newPath })

    expect(store.getHighestSeverity(newPath)).toBeUndefined()
  })

  it('目录重命名和删除只迁移对应子树的诊断', () => {
    const store = useEditorDiagnosticsStore()
    const oldRoot = AbsPath.from('/games/demo/game/scene/chapter-1')
    const newRoot = AbsPath.from('/games/demo/game/scene/prologue')
    const oldPath = AbsPath.from('/games/demo/game/scene/chapter-1/start.txt')
    const newPath = AbsPath.from('/games/demo/game/scene/prologue/start.txt')
    const unrelatedPath = AbsPath.from('/games/demo/game/scene/chapter-10/start.txt')
    store.publish(oldPath, [duplicateLabelDiagnostic()])
    store.publish(unrelatedPath, [duplicateLabelDiagnostic()])

    fileSystemEventHandlers.get('directory:renamed')?.({ oldPath: oldRoot, newPath: newRoot })

    expect(store.getHighestSeverity(oldPath)).toBeUndefined()
    expect(store.getHighestSeverity(newPath)).toBe('warning')
    expect(store.getHighestSeverity(unrelatedPath)).toBe('warning')

    fileSystemEventHandlers.get('directory:removed')?.({ path: newRoot })

    expect(store.getHighestSeverity(newPath)).toBeUndefined()
    expect(store.getHighestSeverity(unrelatedPath)).toBe('warning')
  })

  it('已分析文档被外部修改时清除旧快照直到重新打开分析', () => {
    const store = useEditorDiagnosticsStore()
    const path = AbsPath.from('/games/demo/game/scene/start.txt')
    store.publish(path, [duplicateLabelDiagnostic()])

    fileSystemEventHandlers.get('file:modified')?.({ path })

    expect(store.getHighestSeverity(path)).toBeUndefined()
  })

  it('已打开文档收到外部修改事件时保留快照直到编辑器确定最终内容', () => {
    const store = useEditorDiagnosticsStore()
    const path = AbsPath.from('/games/demo/game/scene/start.txt')
    openTabPaths.add(path)
    store.publish(path, [duplicateLabelDiagnostic()])

    fileSystemEventHandlers.get('file:modified')?.({ path })

    expect(store.getHighestSeverity(path)).toBe('warning')
  })

  it('切换游戏工程时清空上一个工程的诊断快照', async () => {
    const store = useEditorDiagnosticsStore()
    const path = AbsPath.from('/games/demo/game/scene/start.txt')
    store.publish(path, [duplicateLabelDiagnostic()])

    setCurrentGame('game-2', AbsPath.from('/games/other'))
    await nextTick()

    expect(store.getHighestSeverity(path)).toBeUndefined()
  })

  it('当前游戏仅更新元数据时保留诊断快照', async () => {
    const store = useEditorDiagnosticsStore()
    const path = AbsPath.from('/games/demo/game/scene/start.txt')
    store.publish(path, [missingResourceDiagnostic()])

    const workspace = useWorkspaceStore() as unknown as {
      currentGame: { id: string, lastModified?: number, path: AbsPath } | undefined
    }
    workspace.currentGame = {
      ...workspace.currentGame!,
      lastModified: 1,
    }
    await nextTick()

    expect(store.getHighestSeverity(path)).toBe('error')
  })
})
