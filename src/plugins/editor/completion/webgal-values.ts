import * as monaco from 'monaco-editor'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { filterCompletionOptions, queryArgumentValueCompletions } from '~/features/editor/command-registry/completion'

import type { CompletionQueryContext } from '~/features/editor/command-registry/completion'
import type { I18nT } from '~/features/editor/command-registry/schema'

export interface WebgalValueCompletionContext extends CompletionQueryContext {
  command: commandType
  key: string
  prefix: string
  range: monaco.IRange
}

export type WebgalValueBoundary = 'argument' | 'choice' | 'content'

export function extendWebgalValueCompletionRange(
  line: string,
  range: monaco.IRange,
  boundary: WebgalValueBoundary,
): monaco.IRange {
  const cursorOffset = range.endColumn - 1
  const suffix = line.slice(cursorOffset)
  let suffixLength = suffix.length

  if (boundary === 'content') {
    suffixLength = findFirstBoundaryOffset(suffix, [' -', ';'])
  } else if (boundary === 'choice') {
    suffixLength = findFirstBoundaryOffset(suffix, ['|', ';', ' '])
  } else {
    suffixLength = suffix.search(/[;\s]/)
    if (suffixLength === -1) {
      suffixLength = suffix.length
    }
  }

  return {
    ...range,
    endColumn: range.endColumn + suffixLength,
  }
}

function findFirstBoundaryOffset(value: string, boundaries: readonly string[]): number {
  const offsets = boundaries
    .map(boundary => value.indexOf(boundary))
    .filter(offset => offset !== -1)
  return offsets.length > 0 ? Math.min(...offsets) : value.length
}

export async function getWebgalValueCompletions(
  context: WebgalValueCompletionContext,
  t: I18nT,
): Promise<monaco.languages.CompletionItem[]> {
  const options = await queryArgumentValueCompletions(context.command, context.key, context, t)
  return filterCompletionOptions(options, context.prefix).map(option => ({
    label: option.label,
    insertText: option.value,
    kind: monaco.languages.CompletionItemKind.Value,
    range: context.range,
  }))
}
