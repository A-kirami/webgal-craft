interface PreviewSyncRecord {
  key: string
  timestamp: number
}

interface CreateEditorPreviewSyncOptions {
  dedupeWindowMs: number
  dispatch: (path: string, lineNumber: number, lineText: string, force: boolean) => void
  now?: () => number
}

function buildPreviewSyncKey(
  path: string,
  lineNumber: number,
  lineText: string,
  force: boolean,
): string {
  return `${path}|${lineNumber}|${lineText}|${force ? 1 : 0}`
}

export function createEditorPreviewSync(options: CreateEditorPreviewSyncOptions) {
  let lastRecord: PreviewSyncRecord | undefined
  const now = options.now ?? Date.now

  function syncScenePreview(path: string, lineNumber: number, lineText: string, force: boolean = false) {
    const normalizedLineNumber = Math.max(1, Math.trunc(lineNumber))
    const normalizedLineText = lineText ?? ''
    const timestamp = now()
    const key = buildPreviewSyncKey(path, normalizedLineNumber, normalizedLineText, force)

    if (lastRecord
      && lastRecord.key === key
      && timestamp - lastRecord.timestamp < options.dedupeWindowMs) {
      return false
    }

    lastRecord = { key, timestamp }
    options.dispatch(path, normalizedLineNumber, normalizedLineText, force)
    return true
  }

  return {
    syncScenePreview,
  }
}
