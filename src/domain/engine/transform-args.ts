import type { arg, ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { EngineRuntimeCapabilities } from '~/domain/engine/runtime-capabilities'

export type TransformFromMode = 'current' | 'default'

/**
 * WebGAL 变换类语句的写入模式，与引擎 `resolveTransformArgs(sentence, parallel)` 的返回值同构。
 *
 * - `writeDefault`：写回源是 `baseTransform`（true）还是语句执行前的当前变换（false）；
 * - `writeFullEffect`：完整写入（true）还是只写动画定义的字段（false）；`-parallel` 强制 false。
 */
export interface TransformWriteMode {
  transformFrom: TransformFromMode
  writeDefault: boolean
  writeFullEffect: boolean
}

type ArgsSource = Pick<ISentence, 'args'>

function findArgValue(args: readonly arg[], key: string): arg['value'] | undefined {
  return args.find(item => item.key === key)?.value
}

function hasArg(args: readonly arg[], key: string): boolean {
  return args.some(item => item.key === key)
}

/** 对齐引擎 toSafeString：布尔与数字同样参与字符串化，缺省视为未提供 */
function readArgString(args: readonly arg[], key: string): string | undefined {
  const value = findArgValue(args, key)
  if (value === undefined) {
    return undefined
  }
  return typeof value === 'string' ? value : String(value)
}

/** 对齐引擎 toSafeBoolean：只认布尔、数字与非空字符串 true/false */
function readArgBoolean(args: readonly arg[], key: string): boolean | undefined {
  const value = findArgValue(args, key)
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return value !== 0
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') {
      return true
    }
    if (normalized === 'false') {
      return false
    }
  }
  return undefined
}

/**
 * 引擎口径下的 `transformFrom`：存在且字符串化后非空时才有值。
 * 缺失或空串表示回退旧参数；非 `default` 的取值（含裸 flag、未知值）一律解析为 `current`。
 */
export function readTransformFromMode(sentence: ArgsSource): TransformFromMode | undefined {
  const transformFrom = readArgString(sentence.args, 'transformFrom')
  if (transformFrom === undefined || transformFrom === '') {
    return undefined
  }
  return transformFrom === 'default' ? 'default' : 'current'
}

/** 4.6.4 的旧参数规则：writeDefault 取值决定写回源，parallel / ignoreDefault 决定是否完整写入 */
function resolveLegacyWriteMode(sentence: ArgsSource, parallel: boolean): TransformWriteMode {
  const writeDefault = readArgBoolean(sentence.args, 'writeDefault') ?? false
  const writeFullEffect = !parallel && !(readArgBoolean(sentence.args, 'ignoreDefault') ?? false)
  return {
    transformFrom: writeDefault ? 'default' : 'current',
    writeDefault,
    writeFullEffect,
  }
}

/**
 * 解析变换类语句的写入模式，回退顺序与引擎保持一致：
 * `transformFrom` > 显式旧参数（按 key 存在判定）> 默认 `current`。
 *
 * 旧引擎不认 `transformFrom`（等价于参数不存在），完整走 4.6.4 的旧规则；
 * 新引擎无参数时 `writeFullEffect` 从 true 变为 false，这是两个分支唯一的默认值差异。
 *
 * 调用方只应把它用于引擎 `resolveTransformArgs` 的三个消费方：
 * `setTransform`、`setAnimation`、`setTempAnimation`。
 */
export function resolveTransformWriteMode(
  sentence: ArgsSource,
  capabilities: Pick<EngineRuntimeCapabilities, 'transformFrom'>,
): TransformWriteMode {
  const parallel = readArgBoolean(sentence.args, 'parallel') ?? false

  if (!capabilities.transformFrom) {
    return resolveLegacyWriteMode(sentence, parallel)
  }

  const transformFrom = readTransformFromMode(sentence)
  if (transformFrom === 'default') {
    return {
      transformFrom: 'default',
      writeDefault: true,
      writeFullEffect: !parallel,
    }
  }
  if (transformFrom === 'current') {
    return {
      transformFrom: 'current',
      writeDefault: false,
      writeFullEffect: false,
    }
  }

  // 引擎按旧参数的 key 是否存在判定是否走旧分支，与参数取值无关：
  // -writeDefault=false / -ignoreDefault=false 是表达 (writeDefault=false, writeFullEffect=true) 的唯一写法。
  if (hasArg(sentence.args, 'writeDefault') || hasArg(sentence.args, 'ignoreDefault')) {
    return resolveLegacyWriteMode(sentence, parallel)
  }

  return {
    transformFrom: 'current',
    writeDefault: false,
    writeFullEffect: false,
  }
}
