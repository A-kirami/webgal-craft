import { buildStatementSourceRanges, createTransientStatementEntry, ensureParsed, StatementEntry } from '~/domain/script/sentence'
import { getPreviousSpeakerAtIndex } from '~/utils/speaker'

import type * as monaco from 'monaco-editor'
import type { StatementSyntaxCapabilities } from '~/domain/script/sentence'

export interface SceneTextPanelSnapshot {
  endLineNumber?: number
  entry?: StatementEntry
  lineNumber?: number
  previousSpeaker: string
  startLineNumber?: number
  statementIndex?: number
}

export type SceneTextPanelTextModel = Pick<monaco.editor.ITextModel, 'getLineCount' | 'getLineContent'>

function normalizeSceneTextPanelLine(text: string): string {
  return text.endsWith('\r') ? text.slice(0, -1) : text
}

export function createEmptySceneTextPanelSnapshot(): SceneTextPanelSnapshot {
  return {
    endLineNumber: undefined,
    entry: undefined,
    lineNumber: undefined,
    previousSpeaker: '',
    startLineNumber: undefined,
    statementIndex: undefined,
  }
}

export function resolveSceneTextPanelSnapshot(
  lineNumber: number,
  model: SceneTextPanelTextModel,
  capabilities?: StatementSyntaxCapabilities,
): SceneTextPanelSnapshot {
  if (lineNumber < 1 || lineNumber > model.getLineCount()) {
    return createEmptySceneTextPanelSnapshot()
  }

  const lines = Array.from({ length: model.getLineCount() }, (_, index) =>
    normalizeSceneTextPanelLine(model.getLineContent(index + 1)),
  )
  const ranges = buildStatementSourceRanges(lines.join('\n'), capabilities)
  const statementIndex = ranges.findIndex(range =>
    lineNumber - 1 >= range.startLine && lineNumber - 1 <= range.endLine,
  )
  const range = ranges[statementIndex]
  if (!range || !range.rawText.trim()) {
    return createEmptySceneTextPanelSnapshot()
  }

  const entry = createTransientStatementEntry(range.rawText, range.startLine + 1)
  ensureParsed(entry)

  return {
    endLineNumber: range.endLine + 1,
    entry,
    lineNumber,
    previousSpeaker: getPreviousSpeakerAtIndex(ranges, statementIndex),
    startLineNumber: range.startLine + 1,
    statementIndex,
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
  capabilities?: StatementSyntaxCapabilities,
): SceneTextPanelSnapshot {
  return resolveSceneTextPanelSnapshot(lineNumber, createSceneTextPanelTextModel(content), capabilities)
}
