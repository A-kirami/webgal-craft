import { createTransientStatementEntry, ensureParsed, StatementEntry } from '~/helper/webgal-script/sentence'
import { getPreviousSpeakerAtLine } from '~/utils/speaker'

import type * as monaco from 'monaco-editor'

export interface SceneTextPanelSnapshot {
  entry?: StatementEntry
  lineNumber?: number
  previousSpeaker: string
}

export type SceneTextPanelTextModel = Pick<monaco.editor.ITextModel, 'getLineCount' | 'getLineContent'>

function normalizeSceneTextPanelLine(text: string): string {
  return text.endsWith('\r') ? text.slice(0, -1) : text
}

export function createEmptySceneTextPanelSnapshot(): SceneTextPanelSnapshot {
  return {
    entry: undefined,
    lineNumber: undefined,
    previousSpeaker: '',
  }
}

export function resolveSceneTextPanelSnapshot(
  lineNumber: number,
  model: SceneTextPanelTextModel,
): SceneTextPanelSnapshot {
  if (lineNumber < 1 || lineNumber > model.getLineCount()) {
    return createEmptySceneTextPanelSnapshot()
  }

  const rawText = model.getLineContent(lineNumber)
  if (!rawText.trim()) {
    return createEmptySceneTextPanelSnapshot()
  }

  const entry = createTransientStatementEntry(rawText, lineNumber)
  ensureParsed(entry)

  return {
    entry,
    lineNumber,
    previousSpeaker: getPreviousSpeakerAtLine(lineNumber, currentLineNumber =>
      normalizeSceneTextPanelLine(model.getLineContent(currentLineNumber)),
    ),
  }
}

export function createSceneTextPanelTextModel(content: string): SceneTextPanelTextModel {
  const lines = content.split('\n').map(line => normalizeSceneTextPanelLine(line))

  return {
    getLineCount() {
      return lines.length
    },
    getLineContent(lineNumber: number) {
      return lines[lineNumber - 1] ?? ''
    },
  }
}

export function resolveSceneTextPanelSnapshotFromContent(
  lineNumber: number,
  content: string,
): SceneTextPanelSnapshot {
  return resolveSceneTextPanelSnapshot(lineNumber, createSceneTextPanelTextModel(content))
}
