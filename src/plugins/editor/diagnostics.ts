import * as monaco from 'monaco-editor'

import { parseChooseContent } from '~/domain/script/content'
import { buildStatementSourceRanges } from '~/domain/script/sentence'
import { getEditorDiagnosticMessage } from '~/features/editor/diagnostics/presentation'
import { diagnoseScene } from '~/features/editor/diagnostics/scene-diagnostics'
import { i18n } from '~/plugins/i18n'
import { useResourceIndex } from '~/services/resource-index/service'
import { useResourceStore } from '~/stores/resource'
import { useWorkspaceStore } from '~/stores/workspace'

import type { StatementSourceRange, StatementSyntaxCapabilities } from '~/domain/script/sentence'
import type { ResourceReferenceQuery } from '~/services/resource-index/reference-query'

const OWNER = 'webgal-editor-diagnostics'
export function updateEditorDiagnostics(
  model: monaco.editor.ITextModel,
  runtimeCapabilities?: StatementSyntaxCapabilities,
): void {
  if (model.getLanguageId() !== 'webgalscript') {
    monaco.editor.setModelMarkers(model, OWNER, [])
    return
  }

  const workspace = useWorkspaceStore()
  const resourceIndex = useResourceIndex()
  const resourceStore = useResourceStore()
  const canCheckResources = Boolean(workspace.currentGame?.path) && resourceIndex.status.value === 'ready'
  const markers: monaco.editor.IMarkerData[] = []
  const lines = model.getLinesContent()
  const source = lines.join('\n')
  const ranges = buildStatementSourceRanges(source, runtimeCapabilities)
  const sentences = ranges.map(range => range.parsed)

  const diagnostics = diagnoseScene(sentences, {
    engineCapabilities: resourceStore.currentEngineCapabilities,
    hasAssetKey: canCheckResources
      ? key => resourceIndex.hasAssetKey(key)
      : undefined,
  })

  for (const diagnostic of diagnostics) {
    const range = ranges[diagnostic.statementIndex]
    const sentence = range?.parsed
    if (!range || !sentence) {
      continue
    }
    const message = getEditorDiagnosticMessage(diagnostic, i18n.global.t)

    if (diagnostic.code === 'duplicate-label') {
      markers.push({
        ...locateContent(lines, range, diagnostic.label),
        severity: monaco.MarkerSeverity.Warning,
        message,
      })
      continue
    }

    if (diagnostic.code === 'missing-label') {
      markers.push({
        ...locateContent(lines, range, diagnostic.label),
        severity: monaco.MarkerSeverity.Error,
        message,
      })
      continue
    }

    if (diagnostic.code === 'unsupported-live2d' || diagnostic.code === 'unsupported-spine') {
      markers.push({
        ...locateReference(lines, range, sentence, {
          source: diagnostic.field,
          value: diagnostic.value,
        }),
        severity: monaco.MarkerSeverity.Warning,
        message,
      })
      continue
    }

    const markerRange = locateReference(lines, range, sentence, {
      source: diagnostic.field,
      value: diagnostic.value,
    })
    markers.push({
      ...markerRange,
      severity: monaco.MarkerSeverity.Error,
      message,
    })
  }

  if (runtimeCapabilities?.multilineStatements === false) {
    appendUnsupportedMultilineStatementMarkers(markers, lines, source)
  }

  monaco.editor.setModelMarkers(model, OWNER, markers)
}

function appendUnsupportedMultilineStatementMarkers(
  markers: monaco.editor.IMarkerData[],
  lines: readonly string[],
  source: string,
): void {
  const multilineRanges = buildStatementSourceRanges(source)
    .filter(range => range.startLine !== range.endLine)

  for (const range of multilineRanges) {
    markers.push({
      startLineNumber: range.startLine + 1,
      startColumn: 1,
      endLineNumber: range.endLine + 1,
      endColumn: Math.max((lines[range.endLine] ?? '').length, 1) + 1,
      severity: monaco.MarkerSeverity.Error,
      message: i18n.global.t('edit.diagnostics.unsupportedMultilineStatements'),
    })
  }
}

function locateReference(
  lines: readonly string[],
  range: StatementSourceRange,
  sentence: NonNullable<StatementSourceRange['parsed']>,
  reference: Pick<ResourceReferenceQuery, 'source' | 'value'>,
): monaco.IRange {
  if (reference.source.kind === 'content') {
    return locateContent(lines, range, reference.value)
  }

  if (reference.source.kind === 'choice') {
    const choices = parseChooseContent(sentence.content)
    const position = findChoiceTextPosition(lines, range, choices.map(choice => choice.file), reference.source.index)
    const choice = choices[reference.source.index]
    if (position && choice) {
      return createMarkerRange(position, choice.file.length)
    }
  }

  if (reference.source.kind === 'argument') {
    const argumentPattern = new RegExp(String.raw`(?:^|\s)-${escapeRegExp(reference.source.key)}=([^;\s]*)`)
    for (let line = range.startLine; line <= range.endLine; line++) {
      const text = lines[line] ?? ''
      const match = argumentPattern.exec(text)
      if (match?.index === undefined) {
        continue
      }

      const valueStart = match.index + match[0].lastIndexOf('=') + 1
      return createMarkerRange({
        line,
        start: findReferenceStart(text, reference.value, valueStart, valueStart + (match[1]?.length ?? 0)),
      }, reference.value.length)
    }
  }

  return locateContent(lines, range, reference.value)
}

function locateContent(
  lines: readonly string[],
  range: StatementSourceRange,
  value: string,
): monaco.IRange {
  const position = findTextPosition(lines, range, value)
    ?? findFirstNonWhitespacePosition(lines, range)
  return createMarkerRange(position, value.length)
}

function findTextPosition(
  lines: readonly string[],
  range: StatementSourceRange,
  value: string,
): { line: number, start: number } | undefined {
  if (value === '') {
    return
  }

  for (let line = range.startLine; line <= range.endLine; line++) {
    const text = lines[line] ?? ''
    const start = text.indexOf(value)
    if (start !== -1) {
      return { line, start }
    }
  }
}

function findChoiceTextPosition(
  lines: readonly string[],
  range: StatementSourceRange,
  files: readonly string[],
  targetIndex: number,
): { line: number, start: number } | undefined {
  let line = range.startLine
  let start = 0

  for (const [index, file] of files.entries()) {
    if (file === '') {
      continue
    }

    const position = findTextPositionAfter(lines, range.endLine, file, line, start)
    if (!position) {
      return
    }
    if (index === targetIndex) {
      return position
    }

    line = position.line
    start = position.start + file.length
  }
}

function findTextPositionAfter(
  lines: readonly string[],
  endLine: number,
  value: string,
  startLine: number,
  startColumn: number,
): { line: number, start: number } | undefined {
  for (let line = startLine; line <= endLine; line++) {
    const text = lines[line] ?? ''
    const start = text.indexOf(value, line === startLine ? startColumn : 0)
    if (start !== -1) {
      return { line, start }
    }
  }
}

function findFirstNonWhitespacePosition(
  lines: readonly string[],
  range: StatementSourceRange,
): { line: number, start: number } {
  for (let line = range.startLine; line <= range.endLine; line++) {
    const start = (lines[line] ?? '').search(/\S/)
    if (start !== -1) {
      return { line, start }
    }
  }
  return { line: range.startLine, start: 0 }
}

function createMarkerRange(
  position: { line: number, start: number },
  length: number,
): monaco.IRange {
  return {
    startLineNumber: position.line + 1,
    endLineNumber: position.line + 1,
    startColumn: position.start + 1,
    endColumn: position.start + Math.max(length, 1) + 1,
  }
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
