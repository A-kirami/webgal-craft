import { defineStore } from 'pinia'

import { useFileSystemEvents } from '~/composables/useFileSystemEvents'
import { AbsPath } from '~/domain/path'
import { selectHighestDiagnosticSeverity } from '~/features/editor/diagnostics/types'
import { useTabsStore } from '~/stores/tabs'
import { useWorkspaceStore } from '~/stores/workspace'

import type {
  DiagnosticSeverity,
  EditorDiagnostic,
  EditorDiagnosticSource,
  SceneEditorDiagnostic,
} from '~/features/editor/diagnostics/types'

function tryRelativizePath(path: AbsPath, root: AbsPath) {
  try {
    return AbsPath.relativize(path, root)
  } catch {
    return
  }
}

function rebaseDiagnosticPath(path: AbsPath, oldRoot: AbsPath, newRoot: AbsPath): AbsPath | undefined {
  const relativePath = tryRelativizePath(path, oldRoot)
  return relativePath === undefined ? undefined : AbsPath.join(newRoot, relativePath)
}

export const useEditorDiagnosticsStore = defineStore('editor-diagnostics', () => {
  const diagnosticsByPath = shallowReactive(new Map<AbsPath, readonly EditorDiagnostic[]>())
  const fileSystemEvents = useFileSystemEvents()
  const tabsStore = useTabsStore()
  const workspaceStore = useWorkspaceStore()

  function publish(path: AbsPath, diagnostics: readonly EditorDiagnostic[]): void {
    diagnosticsByPath.set(path, markRaw([...diagnostics]))
  }

  function readDiagnostics(path: AbsPath): readonly EditorDiagnostic[] {
    return diagnosticsByPath.get(path) ?? []
  }

  function getHighestSeverity(path: AbsPath): DiagnosticSeverity | undefined {
    return selectHighestDiagnosticSeverity(readDiagnostics(path))
  }

  function readStatementDiagnostics(
    path: AbsPath,
    statementIndex: number,
  ): readonly SceneEditorDiagnostic[] {
    return readDiagnostics(path).filter((diagnostic): diagnostic is SceneEditorDiagnostic =>
      diagnostic.source !== 'document'
      && diagnostic.statementIndex === statementIndex,
    )
  }

  function invalidateSource(source: EditorDiagnosticSource): void {
    for (const [path, currentDiagnostics] of diagnosticsByPath) {
      const diagnostics = currentDiagnostics.filter(diagnostic => diagnostic.source !== source)
      if (diagnostics.length === currentDiagnostics.length) {
        continue
      }
      publish(path, diagnostics)
    }
  }

  function remove(path: AbsPath): void {
    diagnosticsByPath.delete(path)
  }

  function move(oldPath: AbsPath, newPath: AbsPath): void {
    const diagnostics = diagnosticsByPath.get(oldPath)
    diagnosticsByPath.delete(oldPath)
    if (diagnostics) {
      diagnosticsByPath.set(newPath, diagnostics)
    }
  }

  function rebase(oldRoot: AbsPath, newRoot: AbsPath): void {
    for (const [oldPath, diagnostics] of new Map(diagnosticsByPath)) {
      const newPath = rebaseDiagnosticPath(oldPath, oldRoot, newRoot)
      if (!newPath || newPath === oldPath) {
        continue
      }
      diagnosticsByPath.delete(oldPath)
      diagnosticsByPath.set(newPath, diagnostics)
    }
  }

  function removeUnder(root: AbsPath): void {
    for (const path of diagnosticsByPath.keys()) {
      if (tryRelativizePath(path, root) !== undefined) {
        diagnosticsByPath.delete(path)
      }
    }
  }

  function clear(): void {
    diagnosticsByPath.clear()
  }

  watch(
    [
      () => workspaceStore.currentGame?.id,
      () => workspaceStore.currentGame?.path,
    ],
    clear,
  )

  fileSystemEvents.on('file:removed', event => remove(event.path))
  fileSystemEvents.on('file:modified', (event) => {
    if (tabsStore.findTabIndex(event.path) === -1) {
      remove(event.path)
    }
  })
  fileSystemEvents.on('file:renamed', event => move(event.oldPath, event.newPath))
  fileSystemEvents.on('directory:removed', event => removeUnder(event.path))
  fileSystemEvents.on('directory:renamed', event => rebase(event.oldPath, event.newPath))

  return $$({
    diagnosticsByPath,
    getHighestSeverity,
    invalidateSource,
    publish,
    readStatementDiagnostics,
  })
})
