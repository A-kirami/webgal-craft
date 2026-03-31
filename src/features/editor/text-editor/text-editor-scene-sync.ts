export interface TextEditorLineReader {
  getLineContent: (lineNumber: number) => string
  getLineCount: () => number
}

export interface TextEditorCursorLineReader {
  getLineCount: () => number
  getLineMaxColumn: (lineNumber: number) => number
}

export interface TextEditorCursorPosition {
  column: number
  lineNumber: number
}

export function isPlayableSceneLine(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.length > 0 && !trimmed.startsWith(';')
}

export function resolveScenePreviewLine(
  lineNumber: number | undefined,
  reader: TextEditorLineReader,
): { lineNumber: number, lineText: string } | undefined {
  if (!lineNumber) {
    return undefined
  }

  const lineCount = reader.getLineCount()
  if (lineNumber < 1 || lineNumber > lineCount) {
    return undefined
  }

  return {
    lineNumber,
    lineText: reader.getLineContent(lineNumber),
  }
}

export function resolvePlayableScenePreviewLine(
  lineNumber: number | undefined,
  reader: TextEditorLineReader,
): { lineNumber: number, lineText: string } | undefined {
  const previewLine = resolveScenePreviewLine(lineNumber, reader)
  if (!previewLine || !isPlayableSceneLine(previewLine.lineText)) {
    return undefined
  }

  return previewLine
}

export function resolveSceneReplayAnchorLine(
  lineNumber: number | undefined,
  reader: TextEditorLineReader,
): { lineNumber: number, lineText: string } | undefined {
  const previewLine = resolveScenePreviewLine(lineNumber, reader)
  if (!previewLine) {
    return undefined
  }

  for (let currentLineNumber = previewLine.lineNumber - 1; currentLineNumber >= 1; currentLineNumber--) {
    const previousLine = resolvePlayableScenePreviewLine(currentLineNumber, reader)
    if (previousLine) {
      return previousLine
    }
  }

  return isPlayableSceneLine(previewLine.lineText) ? previewLine : undefined
}

export function resolveSceneCursorTarget(
  lineNumber: number | undefined,
  reader: TextEditorCursorLineReader,
  currentPosition?: TextEditorCursorPosition,
): {
  shouldUpdatePosition: boolean
  targetPosition: TextEditorCursorPosition
} | undefined {
  if (!lineNumber) {
    return undefined
  }

  const targetLineNumber = Math.min(Math.max(lineNumber, 1), reader.getLineCount())
  const targetPosition = {
    lineNumber: targetLineNumber,
    column: reader.getLineMaxColumn(targetLineNumber),
  }

  return {
    shouldUpdatePosition: currentPosition?.lineNumber !== targetLineNumber
      || currentPosition.column !== targetPosition.column,
    targetPosition,
  }
}
