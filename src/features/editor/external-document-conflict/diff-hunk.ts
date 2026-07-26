// 遵循 Monaco ILineChange：endLineNumber === 0 表示插入或删除场景中的空区间。
interface DiffLineRange {
  startLineNumber: number
  endLineNumber: number
}

interface ApplyDiffHunkOptions {
  sourceContent: string
  sourceRange: DiffLineRange
  targetContent: string
  targetRange: DiffLineRange
  targetLineEnding: string
}

function splitLines(content: string): string[] {
  return content === '' ? [] : content.split(/\r\n|\r|\n/)
}

function readChangedLines(content: string, range: DiffLineRange): string[] {
  if (range.endLineNumber === 0) {
    return []
  }

  return splitLines(content).slice(range.startLineNumber - 1, range.endLineNumber)
}

export function applyDiffHunk(options: ApplyDiffHunkOptions): string {
  const targetLines = splitLines(options.targetContent)
  const replacementLines = readChangedLines(options.sourceContent, options.sourceRange)
  const insertionIndex = options.targetRange.endLineNumber === 0
    ? options.targetRange.startLineNumber
    : options.targetRange.startLineNumber - 1
  const deleteCount = options.targetRange.endLineNumber === 0
    ? 0
    : options.targetRange.endLineNumber - options.targetRange.startLineNumber + 1

  targetLines.splice(insertionIndex, deleteCount, ...replacementLines)
  return targetLines.join(options.targetLineEnding)
}
