import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { classifyEngineModelReference } from '~/domain/engine/model-capabilities'
import { readTransformFromMode } from '~/domain/engine/transform-args'
import { classifyColorText } from '~/domain/script/color'
import { parseChooseContent } from '~/domain/script/content'
import { createReferencedAssetKey } from '~/services/resource-index/values'

import { getCommandConfig, getCommandScriptString } from './index'
import { deriveArgFieldsFromEditorFields, readArgFields, readEditorFields, readFieldResourceReference } from './schema'

import type { arg, ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { EngineModelCapabilities, EngineModelType } from '~/domain/engine/model-capabilities'
import type { EngineRuntimeCapabilities } from '~/domain/engine/runtime-capabilities'
import type { AssetKey } from '~/services/resource-index/keys'
import type { ResourceReferenceQuery, ResourceReferenceSource } from '~/services/resource-index/reference-query'

export interface UnsupportedEngineModelReference {
  modelType: EngineModelType
  source: { kind: 'content' }
  value: string
}

/**
 * 命中引擎会整句跳过的立绘差分内容。
 * 与 UnsupportedEngineModelReference 的区别在于「引擎不支持该模型类型」与
 * 「该命令对模型不适用，不支持也没关系」是两回事，不复用同一个诊断码。
 */
export interface SkippedFigureDiffModelReference {
  code: 'skipped-figure-diff-model'
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

export interface ChangeFigureDiffCompatReference {
  code: 'unsupported-change-figure-diff'
  source: { kind: 'content' }
  value: string
}

export interface ColorFormatReference {
  code: 'unsupported-color-format' | 'invalid-color-format'
  source: { kind: 'argument', key: string }
  value: string
}

export type TransformWriteModeCompatReference =
  | {
    code: 'unsupported-transform-from'
    source: { kind: 'argument', key: 'transformFrom' }
    value: string
  }
  | {
    code: 'legacy-transform-write-arg'
    source: { kind: 'argument', key: string }
    value: string
    /** 同句的 transformFrom 被引擎识别到非空取值：旧参数被忽略；否则旧参数仍是生效写法 */
    overriddenByTransformFrom: boolean
  }

const RESERVED_CALL_SCENE_ARGUMENTS = ['next', 'continue'] as const

/** 只有引擎 resolveTransformArgs 的三个消费方受变换写入模式参数影响 */
const TRANSFORM_WRITE_MODE_COMMANDS: ReadonlySet<commandType> = new Set([
  commandType.setTransform,
  commandType.setAnimation,
  commandType.setTempAnimation,
])

const LEGACY_TRANSFORM_WRITE_ARG_KEYS: ReadonlySet<string> = new Set(['writeDefault', 'ignoreDefault'])

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

/**
 * 立绘差分只替换图片，Live2D / Spine 用各自的表情与动作系统，引擎对本命令会整句跳过。
 * 与引擎是否支持该模型类型无关，因此不看 EngineModelCapabilities。
 */
export function findSkippedFigureDiffModelReferences(
  sentence: ISentence,
): SkippedFigureDiffModelReference[] {
  if (sentence.command !== commandType.changeFigureDiff) {
    return []
  }

  const value = sentence.content.trim()
  const modelType = classifyEngineModelReference(value)
  if (!modelType) {
    return []
  }

  return [{
    code: 'skipped-figure-diff-model',
    modelType,
    source: { kind: 'content' },
    value,
  }]
}

/**
 * 立绘差分是 4.6.5 起的能力：旧引擎只把整句当旁白读出，不执行也不报错。
 *
 * 旧运行时的解析器不认识该命令，这句会退化成 say 简写（commandRaw 就是原命令名），
 * 因此不能只看 command，必须同时认 commandRaw —— 否则版本诊断在任何旧引擎上都不会触发。
 * 该命令在 domain/script/parser.ts 的 LEGACY_WEBGAL_SCRIPT_CONFIG 里被排除，两处判据必须同时成立。
 */
export function findChangeFigureDiffCompatReferences(
  sentence: ISentence,
  capabilities: Pick<EngineRuntimeCapabilities, 'changeFigureDiff'>,
): ChangeFigureDiffCompatReference[] {
  if (capabilities.changeFigureDiff || !isChangeFigureDiffStatement(sentence)) {
    return []
  }

  return [{
    code: 'unsupported-change-figure-diff',
    source: { kind: 'content' },
    value: sentence.content.trim(),
  }]
}

function isChangeFigureDiffStatement(sentence: ISentence): boolean {
  if (sentence.command === commandType.changeFigureDiff) {
    return true
  }
  // 旧运行时解析器把不认识的命令退化成 say 简写，commandRaw 保留原命令名
  return sentence.command === commandType.say
    && sentence.commandRaw === getCommandScriptString(commandType.changeFigureDiff)
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

/**
 * 变换写入参数的跨版本兼容诊断：
 * 旧参数按 key 存在判定（不看取值）；它是否被当前引擎忽略，按 transformFrom 是否被识别到非空取值判定。
 * 4.6.5 之前不认 transformFrom；4.6.5+ 以 transformFrom 为准，旧参数只为 4.6.4 或更低版本保留。
 * changeFigure / changeBg / setTransition 的 ignoreDefault 与写入模式无关，不在此列。
 */
export function findTransformWriteModeCompatReferences(
  sentence: ISentence,
  capabilities: Pick<EngineRuntimeCapabilities, 'transformFrom'>,
): TransformWriteModeCompatReference[] {
  if (!TRANSFORM_WRITE_MODE_COMMANDS.has(sentence.command)) {
    return []
  }

  if (!capabilities.transformFrom) {
    const item = sentence.args.find(arg => arg.key === 'transformFrom')
    return item
      ? [{
          code: 'unsupported-transform-from',
          source: { kind: 'argument', key: 'transformFrom' },
          value: toReferenceValue(item),
        }]
      : []
  }

  const overriddenByTransformFrom = readTransformFromMode(sentence) !== undefined

  return sentence.args
    .filter(item => LEGACY_TRANSFORM_WRITE_ARG_KEYS.has(item.key))
    .map(item => ({
      code: 'legacy-transform-write-arg' as const,
      source: { kind: 'argument', key: item.key },
      value: toReferenceValue(item),
      overriddenByTransformFrom,
    }))
}

function toReferenceValue(item: arg): string {
  return typeof item.value === 'string' ? item.value : item.key
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
      value: toReferenceValue(item),
    }))
}

/**
 * 找出 color 参数里编辑器无法编辑（unsupported）或根本不是色值（invalid）的值。
 * 越界但语法合法的值（如 `rgb(300, 0, 0)`）按 CSS 语义裁剪，与引擎渲染结果一致，不算异常。
 */
export function findColorFormatReferences(sentence: ISentence): ColorFormatReference[] {
  const references: ColorFormatReference[] = []

  for (const argField of readArgFields(getCommandConfig(sentence.command))) {
    if (argField.field.type !== 'color' || argField.jsonMeta) {
      continue
    }

    const item = sentence.args.find(candidate => candidate.key === argField.storageKey)
    const value = typeof item?.value === 'string' ? item.value.trim() : ''
    if (!value) {
      continue
    }

    const syntax = classifyColorText(value)
    if (syntax === 'supported') {
      continue
    }

    references.push({
      code: syntax === 'unsupported' ? 'unsupported-color-format' : 'invalid-color-format',
      source: { kind: 'argument', key: argField.storageKey },
      value,
    })
  }

  return references
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
