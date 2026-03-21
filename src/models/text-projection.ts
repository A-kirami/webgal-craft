import { createDocumentModel } from './document-model'

import type { DocumentModel, TextMetadata } from './document-model'

export function applyTextContentToDocument(
  model: DocumentModel,
  resultContent: string,
): DocumentModel {
  return rebuildDocumentModel(model, resultContent, model.metadata)
}

export function replaceDocumentText(
  model: DocumentModel,
  content: string,
  metadata: Partial<TextMetadata> | undefined = undefined,
): DocumentModel {
  return rebuildDocumentModel(model, content, metadata)
}

function rebuildDocumentModel(
  model: DocumentModel,
  content: string,
  metadata: Partial<TextMetadata> | undefined = undefined,
): DocumentModel {
  if (model.kind === 'scene') {
    return {
      kind: 'scene',
      statements: rebuildStatementsWithStableIds(model.statements, content),
      metadata: {
        ...model.metadata,
        ...metadata,
      },
    }
  }

  return createDocumentModel({
    kind: model.kind,
    content,
    metadata: {
      ...model.metadata,
      ...metadata,
    },
  })
}

export function getTextOffsetFromPosition(content: string, line: number, column: number): number {
  if (line <= 1) {
    return Math.max(0, column - 1)
  }

  let currentLine = 1
  let index = 0
  while (currentLine < line && index < content.length) {
    if (content[index] === '\n') {
      currentLine++
    }
    index++
  }

  return index + Math.max(0, column - 1)
}

export function getTextPositionFromOffset(
  content: string,
  offset: number,
): { lineNumber: number, column: number } {
  const targetOffset = Math.min(Math.max(offset, 0), content.length)
  let currentLine = 1
  let lastLineStart = 0

  for (let index = 0; index < targetOffset; index++) {
    if (content[index] === '\n') {
      currentLine++
      lastLineStart = index + 1
    }
  }

  return {
    lineNumber: currentLine,
    column: targetOffset - lastLineStart + 1,
  }
}
