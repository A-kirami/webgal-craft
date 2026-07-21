import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { parseChooseContent } from '~/domain/script/content'
import { createReferencedAssetKey } from '~/services/resource-index/values'

import { getCommandConfig } from './index'
import { deriveArgFieldsFromEditorFields, readEditorFields, readFieldResourceReference } from './schema'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { AssetKey } from '~/services/resource-index/keys'

export type ResourceReferenceSource =
  | { kind: 'content' }
  | { kind: 'argument', key: string }
  | { kind: 'choice', index: number }

export interface ResourceReferenceQuery {
  assetKey: AssetKey
  value: string
  source: ResourceReferenceSource
}

export function isSameResourceReferenceSource(
  left: ResourceReferenceSource,
  right: ResourceReferenceSource,
): boolean {
  if (left.kind !== right.kind) {
    return false
  }

  if (left.kind === 'argument' && right.kind === 'argument') {
    return left.key === right.key
  }

  if (left.kind === 'choice' && right.kind === 'choice') {
    return left.index === right.index
  }

  return true
}

/**
 * 从已解析语句和命令注册表投影带路径身份的资源引用。
 * 由调用方决定如何检查资源索引以及如何呈现引用位置。
 */
export function querySentenceResourceReferences(sentence: ISentence): ResourceReferenceQuery[] {
  const entry = getCommandConfig(sentence.command)
  const editorFields = readEditorFields(entry)
  const contentField = editorFields.find(field => field.storage === 'content')?.field
  const result: ResourceReferenceQuery[] = []

  const contentResource = contentField && readFieldResourceReference(contentField)
  if (contentResource) {
    const { assetType } = contentResource
    if (assetType === 'scene' && sentence.command === commandType.choose) {
      for (const [index, item] of parseChooseContent(sentence.content).entries()) {
        addReference(result, assetType, item.file, { kind: 'choice', index })
      }
    } else {
      addReference(result, assetType, sentence.content, { kind: 'content' })
    }
  }

  for (const argField of deriveArgFieldsFromEditorFields(editorFields)) {
    const resourceReference = readFieldResourceReference(argField.field)
    if (argField.jsonMeta || !resourceReference) {
      continue
    }

    const item = sentence.args.find(candidate => candidate.key === argField.storageKey)
    if (!item || typeof item.value !== 'string') {
      continue
    }

    addReference(result, resourceReference.assetType, item.value, {
      kind: 'argument',
      key: argField.storageKey,
    })
  }

  return result
}

export function findMissingSentenceResourceReferences(
  sentence: ISentence,
  hasAssetKey: (key: AssetKey) => boolean,
): ResourceReferenceQuery[] {
  return querySentenceResourceReferences(sentence)
    .filter(reference => !hasAssetKey(reference.assetKey))
}

function addReference(result: ResourceReferenceQuery[], assetType: string, value: string, source: ResourceReferenceSource): void {
  const assetKey = createReferencedAssetKey(assetType, value)
  if (!assetKey) {
    return
  }

  result.push({ assetKey, value: value.trim(), source })
}
