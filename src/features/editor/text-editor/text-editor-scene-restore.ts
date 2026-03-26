export interface SceneCursorTargetPosition {
  column: number
  lineNumber: number
}

export interface SceneCursorTarget {
  shouldUpdatePosition: boolean
  targetPosition: SceneCursorTargetPosition
}

export interface SceneCursorTargetEditor {
  layout: () => void
  revealPositionInCenterIfOutsideViewport: (
    position: SceneCursorTargetPosition,
    scrollType?: number,
  ) => void
  setPosition: (position: SceneCursorTargetPosition) => void
}

export function prepareSceneCursorTarget(
  editor: Pick<SceneCursorTargetEditor, 'setPosition'>,
  cursorTarget: SceneCursorTarget,
) {
  if (cursorTarget.shouldUpdatePosition) {
    editor.setPosition(cursorTarget.targetPosition)
  }
}

export function applySceneCursorTarget(
  editor: SceneCursorTargetEditor,
  cursorTarget: SceneCursorTarget,
  scrollType?: number,
) {
  prepareSceneCursorTarget(editor, cursorTarget)
  editor.layout()

  editor.revealPositionInCenterIfOutsideViewport(cursorTarget.targetPosition, scrollType)
}
