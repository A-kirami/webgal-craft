import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { parseChooseContent } from '~/domain/script/content'
import { createReferencedAssetKey } from '~/services/resource-index/values'

import { getCommandConfig } from './index'
import { deriveArgFieldsFromEditorFields, readEditorFields, readFieldResourceReference } from './schema'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { AssetKey } from '~/services/resource-index/keys'
import type { ResourceReferenceQuery, ResourceReferenceSource } from '~/services/resource-index/reference-query'

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
