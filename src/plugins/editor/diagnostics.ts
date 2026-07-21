import * as monaco from 'monaco-editor'

import { parseSceneOrEmpty } from '~/domain/script/parser'
import { getEditorDiagnosticMessage } from '~/features/editor/diagnostics/presentation'
import { diagnoseScene } from '~/features/editor/diagnostics/scene-diagnostics'
import { i18n } from '~/plugins/i18n'
import { useResourceIndex } from '~/services/resource-index/service'
import { useWorkspaceStore } from '~/stores/workspace'

import type { ResourceReferenceQuery } from '~/services/resource-index/reference-query'

const OWNER = 'webgal-editor-diagnostics'
const TEMP_SCENE_NAME = 'tempScene'
const TEMP_SCENE_URL = 'tempUrl'

export function updateEditorDiagnostics(model: monaco.editor.ITextModel): void {
  if (model.getLanguageId() !== 'webgalscript') {
    monaco.editor.setModelMarkers(model, OWNER, [])
    return
  }

  const workspace = useWorkspaceStore()
  const resourceIndex = useResourceIndex()
  const canCheckResources = Boolean(workspace.currentGame?.path) && resourceIndex.status.value === 'ready'
  const markers: monaco.editor.IMarkerData[] = []
  const lines = model.getLinesContent()
  const sentences = lines.map(line => parseSceneOrEmpty(line, TEMP_SCENE_NAME, TEMP_SCENE_URL).sentenceList[0])

  const diagnostics = diagnoseScene(sentences, canCheckResources
    ? { hasAssetKey: key => resourceIndex.hasAssetKey(key) }
    : {})

  for (const diagnostic of diagnostics) {
    const lineNumber = diagnostic.statementIndex + 1
    const line = lines[diagnostic.statementIndex] ?? ''
    const sentence = sentences[diagnostic.statementIndex]
    if (!sentence) {
      continue
    }
    const message = getEditorDiagnosticMessage(diagnostic, i18n.global.t)

    if (diagnostic.code === 'duplicate-label') {
      markers.push({
        ...locateContent(lineNumber, line, sentence.commandRaw, diagnostic.label),
        severity: monaco.MarkerSeverity.Warning,
        message,
      })
      continue
    }

    if (diagnostic.code === 'missing-label') {
      markers.push({
        ...locateContent(lineNumber, line, sentence.commandRaw, diagnostic.label),
        severity: monaco.MarkerSeverity.Error,
        message,
      })
      continue
    }

    const range = locateReference(lineNumber, line, sentence.commandRaw, {
      source: diagnostic.field,
      value: diagnostic.value,
    })
    markers.push({
      ...range,
      severity: monaco.MarkerSeverity.Error,
      message,
    })
  }

  monaco.editor.setModelMarkers(model, OWNER, markers)
}

function locateContent(lineNumber: number, line: string, commandRaw: string, value: string): monaco.IRange {
  const colon = line.indexOf(':', commandRaw.length)
  const contentStart = colon === -1 ? 0 : colon + 1
  const contentEnd = findFirstBoundary(line, contentStart, [' -', ';'])
  const start = findReferenceStart(line, value, contentStart, contentEnd)

  return {
    startLineNumber: lineNumber,
    endLineNumber: lineNumber,
    startColumn: start + 1,
    endColumn: start + Math.max(value.length, 1) + 1,
  }
}

function locateReference(
  lineNumber: number,
  line: string,
  commandRaw: string,
  reference: Pick<ResourceReferenceQuery, 'source' | 'value'>,
): monaco.IRange {
  const fallback = Math.max(0, line.indexOf(reference.value))
  let start = fallback

  if (reference.source.kind === 'content') {
    return locateContent(lineNumber, line, commandRaw, reference.value)
  } else if (reference.source.kind === 'choice') {
    const contentStart = line.indexOf(':', commandRaw.length) + 1
    if (contentStart > 0) {
      const choices = line.slice(contentStart).split('|')
      const choice = choices[reference.source.index]
      const choiceFileSeparator = choice?.indexOf(':') ?? -1
      if (choice && choiceFileSeparator !== -1) {
        const choiceStart = contentStart
          + choices.slice(0, reference.source.index).reduce((offset, item) => offset + item.length + 1, 0)
        const valueStart = choiceStart + choiceFileSeparator + 1
        start = findReferenceStart(line, reference.value, valueStart, choiceStart + choice.length)
      }
    }
  } else {
    const match = new RegExp(String.raw`(?:^|\s)-${escapeRegExp(reference.source.key)}=([^;\s]*)`).exec(line)
    if (match?.index !== undefined) {
      const valueStart = match.index + match[0].lastIndexOf('=') + 1
      start = findReferenceStart(line, reference.value, valueStart, valueStart + (match[1]?.length ?? 0))
    }
  }

  return {
    startLineNumber: lineNumber,
    endLineNumber: lineNumber,
    startColumn: start + 1,
    endColumn: start + Math.max(reference.value.length, 1) + 1,
  }
}

function findFirstBoundary(line: string, start: number, boundaries: readonly string[]): number {
  const positions = boundaries
    .map(boundary => line.indexOf(boundary, start))
    .filter(position => position !== -1)
  return positions.length > 0 ? Math.min(...positions) : line.length
}

function findReferenceStart(line: string, value: string, start: number, end: number): number {
  const exactStart = line.indexOf(value, start)
  if (exactStart !== -1 && exactStart < end) {
    return exactStart
  }

  const firstNonWhitespace = line.slice(start, end).search(/\S/)
  return firstNonWhitespace === -1 ? start : start + firstNonWhitespace
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}
