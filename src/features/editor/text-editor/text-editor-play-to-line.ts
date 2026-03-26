import { resolvePlayableScenePreviewLine } from '~/features/editor/text-editor/text-editor-scene-sync'

import type { TextEditorLineReader } from '~/features/editor/text-editor/text-editor-scene-sync'

export const PLAY_TO_LINE_GLYPH_CLASS_NAME = 'play-to-line-glyph'

export interface TextEditorPlayToLineEditor {
  deltaDecorations: (
    oldDecorations: string[],
    newDecorations: TextEditorPlayToLineDecoration[],
  ) => string[]
  getModel: () => TextEditorLineReader | null | undefined
  getPosition: () => { lineNumber: number } | null | undefined
}

export interface TextEditorPlayToLineDecoration {
  range: {
    endColumn: number
    endLineNumber: number
    startColumn: number
    startLineNumber: number
  }
  options: {
    glyphMarginClassName: string
    glyphMarginHoverMessage: {
      value: string
    }
  }
}

export interface TextEditorPlayToLineMouseEvent {
  event: {
    leftButton: boolean
  }
  target: {
    position?: {
      lineNumber: number
    } | null
    type: number
  }
}

interface CreateTextEditorPlayToLineControllerOptions {
  editor: TextEditorPlayToLineEditor
  getHoverMessage: () => string
  getPath: () => string
  glyphMarginTargetType: number
  isEnabled: () => boolean
  syncScenePreview: (path: string, lineNumber: number, lineText: string, force: boolean) => void
}

function createPlayToLineDecoration(
  lineNumber: number,
  hoverMessage: string,
): TextEditorPlayToLineDecoration {
  return {
    range: {
      endColumn: 1,
      endLineNumber: lineNumber,
      startColumn: 1,
      startLineNumber: lineNumber,
    },
    options: {
      glyphMarginClassName: PLAY_TO_LINE_GLYPH_CLASS_NAME,
      glyphMarginHoverMessage: {
        value: hoverMessage,
      },
    },
  }
}

export function createTextEditorPlayToLineController(options: CreateTextEditorPlayToLineControllerOptions) {
  let decorationIds: string[] = []
  let decoratedLineNumber: number | undefined

  function clearDecorations() {
    decoratedLineNumber = undefined

    if (decorationIds.length === 0) {
      return
    }

    decorationIds = options.editor.deltaDecorations(decorationIds, [])
  }

  function syncDecorationsForLine(lineNumber: number | undefined) {
    if (!options.isEnabled()) {
      clearDecorations()
      return
    }

    const model = options.editor.getModel()
    if (!model) {
      clearDecorations()
      return
    }

    const previewLine = resolvePlayableScenePreviewLine(lineNumber, model)
    if (!previewLine) {
      clearDecorations()
      return
    }

    decorationIds = options.editor.deltaDecorations(decorationIds, [
      createPlayToLineDecoration(previewLine.lineNumber, options.getHoverMessage()),
    ])
    decoratedLineNumber = previewLine.lineNumber
  }

  function syncFromEditorPosition() {
    syncDecorationsForLine(options.editor.getPosition()?.lineNumber)
  }

  function handleMouseDown(event: TextEditorPlayToLineMouseEvent) {
    if (!options.isEnabled()) {
      return
    }

    if (!event.event.leftButton) {
      return
    }

    if (event.target.type !== options.glyphMarginTargetType || !event.target.position) {
      return
    }

    if (event.target.position.lineNumber !== decoratedLineNumber) {
      return
    }

    const model = options.editor.getModel()
    if (!model) {
      return
    }

    const previewLine = resolvePlayableScenePreviewLine(event.target.position.lineNumber, model)
    if (!previewLine) {
      return
    }

    options.syncScenePreview(
      options.getPath(),
      previewLine.lineNumber,
      previewLine.lineText,
      true,
    )
  }

  function dispose() {
    clearDecorations()
  }

  return {
    dispose,
    handleMouseDown,
    syncDecorationsForLine,
    syncFromEditorPosition,
  }
}
