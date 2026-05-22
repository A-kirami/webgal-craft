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
