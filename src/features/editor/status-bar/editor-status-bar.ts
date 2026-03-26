import { countLines, countWords } from 'alfaaz'

import type { AssetPreviewState, EditableEditorState } from '~/stores/editor'

export interface EditorStatusBarTextStats {
  lineCount: number
  wordCount: number
}

export type EditorStatusBarMetrics =
  | { kind: 'text', lineCount: number, wordCount: number }
  | { kind: 'scene', count: number }
  | { kind: 'animation', count: number }

export interface ResolveEditorStatusBarFileLanguageOptions {
  getLanguageDisplayName: (path: string) => string
  t: (key: string) => string
}

export function isEditorStatusBarSaved(editableState: Pick<EditableEditorState, 'isDirty'> | undefined): boolean {
  return !(editableState?.isDirty ?? false)
}

export function shouldShowEditorStatusBarRelativeTime(
  isSaved: boolean,
  lastSavedTime: EditableEditorState['lastSavedTime'],
): boolean {
  return isSaved && !!lastSavedTime
}

export function calculateEditorStatusBarTextStats(textContent: string): EditorStatusBarTextStats {
  return {
    wordCount: countWords(textContent),
    lineCount: countLines(textContent),
  }
}

export function resolveEditorStatusBarFileLanguage(
  editableState: EditableEditorState | undefined,
  options: ResolveEditorStatusBarFileLanguageOptions,
): string {
  if (!editableState) {
    return ''
  }

  switch (editableState.kind) {
    case 'scene': {
      return options.t('edit.textEditor.languages.webgalscript')
    }
    case 'animation': {
      return options.t('edit.textEditor.languages.webgalanimation')
    }
    default: {
      return options.getLanguageDisplayName(editableState.path)
    }
  }
}

export function resolveEditorStatusBarMetrics(
  editableState: EditableEditorState | undefined,
  textStats: EditorStatusBarTextStats,
): EditorStatusBarMetrics | undefined {
  if (!editableState) {
    return
  }

  if (editableState.projection === 'visual') {
    if (editableState.kind === 'scene') {
      return {
        kind: 'scene',
        count: editableState.statements.length,
      }
    }

    if (editableState.kind === 'animation') {
      return {
        kind: 'animation',
        count: editableState.frames.length,
      }
    }
  }

  return {
    kind: 'text',
    lineCount: textStats.lineCount,
    wordCount: textStats.wordCount,
  }
}

export function isEditorStatusBarImagePreview(previewState: AssetPreviewState | undefined): boolean {
  return previewState?.mimeType.startsWith('image/') ?? false
}
