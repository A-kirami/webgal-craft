import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { classifyEngineModelReference } from '~/domain/engine/model-capabilities'
import { parseChooseContent } from '~/domain/script/content'
import { createReferencedAssetKey } from '~/services/resource-index/values'

import { getCommandConfig } from './index'
import { deriveArgFieldsFromEditorFields, readEditorFields, readFieldResourceReference } from './schema'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { EngineModelCapabilities, EngineModelType } from '~/domain/engine/model-capabilities'
import type { EngineRuntimeCapabilities } from '~/domain/engine/runtime-capabilities'
import type { AssetKey } from '~/services/resource-index/keys'
import type { ResourceReferenceQuery, ResourceReferenceSource } from '~/services/resource-index/reference-query'

export interface UnsupportedEngineModelReference {
  modelType: EngineModelType
  source: { kind: 'content' }
  value: string
}

export interface UnsupportedEngineOpusVocalReference {
  source: { kind: 'argument', key: 'vocal' }
  value: string
}

export type UnsupportedSceneSemanticReference =
  | {
    code: 'unsupported-return-command'
    source: { kind: 'content' }
    value: string
  }
  | {
    code: 'unsupported-local-variable'
    source: { kind: 'argument', key: 'local' }
    value: 'local'
  }
  | {
    code: 'unsupported-call-scene-argument'
    source: { kind: 'argument', key: string }
    value: string
  }

export interface ReservedCallSceneArgument {
  argument: 'continue' | 'next'
  source: { kind: 'argument', key: string }
}

const RESERVED_CALL_SCENE_ARGUMENTS = ['next', 'continue'] as const

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

export function findUnsupportedEngineModelReferences(
  sentence: ISentence,
  capabilities: EngineModelCapabilities,
): UnsupportedEngineModelReference[] {
  const value = sentence.content.trim()
  const modelType = classifySentenceEngineModelReference(sentence.command, value)
  if (!modelType || capabilities[modelType]) {
    return []
  }

  return [{
    modelType,
    source: { kind: 'content' },
    value,
  }]
}

export function findUnsupportedEngineOpusVocalReferences(
  sentence: ISentence,
  capabilities: Pick<EngineRuntimeCapabilities, 'opusVocalShorthand'>,
): UnsupportedEngineOpusVocalReference[] {
  if (sentence.command !== commandType.say || capabilities.opusVocalShorthand) {
    return []
  }

  // 解析器会把显式 vocal 参数和文件简写归一化为同一字段；Craft 保存时统一输出简写。
  const vocal = sentence.args.find(arg => arg.key === 'vocal')
  if (typeof vocal?.value !== 'string' || !vocal.value.toLowerCase().endsWith('.opus')) {
    return []
  }

  return [{
    source: { kind: 'argument', key: 'vocal' },
    value: vocal.value,
  }]
}

export function findReservedCallSceneArguments(sentence: ISentence): ReservedCallSceneArgument[] {
  if (sentence.command !== commandType.callScene) {
    return []
  }

  return RESERVED_CALL_SCENE_ARGUMENTS
    .filter(argument => sentence.args.some(item => item.key === argument))
    .map(argument => ({
      argument,
      source: { kind: 'argument', key: argument },
    }))
}

export function findUnsupportedSceneSemanticReferences(
  sentence: ISentence,
  capabilities: EngineRuntimeCapabilities,
): UnsupportedSceneSemanticReference[] {
  if (capabilities.sceneSemantics) {
    return []
  }

  if (sentence.command === commandType.return) {
    return [{
      code: 'unsupported-return-command',
      source: { kind: 'content' },
      value: sentence.commandRaw,
    }]
  }

  if (sentence.command === commandType.setVar && sentence.args.some(item => item.key === 'local')) {
    return [{
      code: 'unsupported-local-variable',
      source: { kind: 'argument', key: 'local' },
      value: 'local',
    }]
  }

  if (sentence.command !== commandType.callScene) {
    return []
  }

  return sentence.args
    .filter(item => item.key !== 'next' && item.key !== 'continue')
    .map(item => ({
      code: 'unsupported-call-scene-argument' as const,
      source: { kind: 'argument', key: item.key },
      value: typeof item.value === 'string' ? item.value : item.key,
    }))
}

function classifySentenceEngineModelReference(
  command: commandType,
  value: string,
): EngineModelType | undefined {
  if (command === commandType.changeFigure) {
    return classifyEngineModelReference(value)
  }
  if (command === commandType.changeBg && value.toLowerCase().endsWith('.skel')) {
    return 'spine'
  }
}

function addReference(result: ResourceReferenceQuery[], assetType: string, value: string, source: ResourceReferenceSource): void {
  const assetKey = createReferencedAssetKey(assetType, value)
  if (!assetKey) {
    return
  }
  result.push({ assetKey, value: value.trim(), source })
}
