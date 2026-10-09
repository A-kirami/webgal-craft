import type { useEditorStore } from '~/stores/editor'

export interface PreviewReadySyncTarget {
  path: string
  lineNumber: number
  lineText: string
}

export interface ResolvePreviewReadySyncTargetOptions {
  activeDocumentKind?: string
  activeDocumentPath?: string
  selectedLineNumber?: number
  textContent?: string
}

export function resolvePreviewReadySyncTarget(
  options: ResolvePreviewReadySyncTargetOptions,
): PreviewReadySyncTarget | undefined {
  if (options.activeDocumentKind !== 'scene' || !options.activeDocumentPath) {
    return undefined
  }

  const lines = options.textContent?.split(/\r?\n/u) ?? ['']
  const requestedLineNumber = options.selectedLineNumber ?? 1
  const hasRequestedLine = requestedLineNumber >= 1 && requestedLineNumber <= lines.length
  const lineNumber = hasRequestedLine ? requestedLineNumber : 1

  return {
    path: options.activeDocumentPath,
    lineNumber,
    lineText: lines[lineNumber - 1] ?? '',
  }
}

/** 从编辑器当前状态解析预览就绪后首次同步的目标；内嵌与外部预览共用 */
export function resolveCurrentPreviewReadySyncTarget(
  editorStore: ReturnType<typeof useEditorStore>,
): PreviewReadySyncTarget | undefined {
  const currentState = editorStore.currentState
  const activeDocumentKind = currentState && 'kind' in currentState ? currentState.kind : undefined
  const activeDocumentPath = currentState && 'path' in currentState ? currentState.path : undefined

  return resolvePreviewReadySyncTarget({
    activeDocumentKind,
    activeDocumentPath,
    selectedLineNumber: editorStore.currentSceneSelection?.lastLineNumber,
    textContent: editorStore.currentTextProjection?.textContent,
  })
}
