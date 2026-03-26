import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { CommandNode, FIGURE_POSITION_FLAGS, GenericCommandNode, isGenericNode, SayCommandNode } from '~/domain/script/types'
import { getCommandConfig } from '~/features/editor/command-registry/index'
import { isFlagChoiceField, readArgFields } from '~/features/editor/command-registry/schema'

export interface CommandParamDescriptor {
  key: string
  type: string
  defaultValue?: string | boolean | number
}

// 哨兵值：区分"字段不存在/不由此路径处理"与"字段存在但值为 undefined"。
// 返回 NOT_HANDLED 表示当前读取路径无法处理该 key，调用方应回退到 extraArgs 查找
const NOT_HANDLED = Symbol('command-param-not-handled')

type ParamValue = string | boolean | number | undefined
type FieldKind = 'string' | 'number' | 'boolean'

// ─── 从注册表派生字段元信息 ─────────────────────────

interface ResolvedFieldMeta {
  kind: FieldKind
  /** typed node 上的属性名（json-object 子字段 alias，如 id → figureId） */
  field?: string
}

function fieldTypeToKind(type: string): FieldKind {
  switch (type) {
    case 'number':
    case 'dial': {
      return 'number'
    }
    case 'switch': {
      return 'boolean'
    }
    default: {
      return 'string'
    }
  }
}

/** 注册表缓存：commandType → { argKey → ResolvedFieldMeta } */
const registryMetaCache = new Map<commandType, Map<string, ResolvedFieldMeta>>()

function getRegistryMeta(type: commandType): Map<string, ResolvedFieldMeta> {
  let cached = registryMetaCache.get(type)
  if (cached) {
    return cached
  }

  cached = new Map<string, ResolvedFieldMeta>()
  const entry = getCommandConfig(type)
  const argFields = readArgFields(entry)

  for (const af of argFields) {
    if (af.jsonMeta) {
      // json-object 子字段不注册到 meta：
      // 原始 arg（如 blink）通过 findExtraArgValue 读取，
      // 子字段（如 blinkInterval）由 statement-editor 层的 readJsonFieldValue 处理
    } else if (af.field.type === 'choice' && isFlagChoiceField(af.field)) {
      // flag choice 字段由特殊路径处理，不注册到 meta
    } else {
      cached.set(af.field.key, { kind: fieldTypeToKind(af.field.type) })
    }
  }

  registryMetaCache.set(type, cached)
  return cached
}

/** 供 update.ts 使用：获取注册表中某命令的字段元信息 */
export function resolveRegistryFieldMeta(
  type: commandType,
  key: string,
): { kind: FieldKind, field?: string } | undefined {
  return getRegistryMeta(type).get(key)
}

/** 供 update.ts 使用：获取注册表中某命令的所有已知 arg key */
export function getRegistryKnownKeys(type: commandType): Set<string> {
  const meta = getRegistryMeta(type)
  const keys = new Set(meta.keys())
  // changeFigure 的 left/right 是 flag-choice 的选项值而非独立参数 key，
  // 不在注册表 meta 中，但在 args 数组中以 { key: 'left', value: true } 形式存在，
  // 需要手动补充以确保 upsertArgValue 能正确判断已知/未知参数的插入位置
  if (type === commandType.changeFigure) {
    keys.add('left')
    keys.add('right')
  }
  return keys
}

// ─── typed node 特殊路径 ────────────────────────────

const CHANGE_FIGURE_POSITION_FLAGS = ['left', 'right'] as const

function readSayFlagSelect(node: SayCommandNode, key: string): ParamValue | typeof NOT_HANDLED {
  if (key === 'figurePosition') {
    return node.figurePosition
  }
  if ((FIGURE_POSITION_FLAGS as readonly string[]).includes(key)) {
    return node.figurePosition === key
  }
  return NOT_HANDLED
}

function readChangeFigurePosition(node: GenericCommandNode, key: string): ParamValue | typeof NOT_HANDLED {
  if (node.type !== commandType.changeFigure || key !== 'position') {
    return NOT_HANDLED
  }
  for (const flag of CHANGE_FIGURE_POSITION_FLAGS) {
    if (node.args.some(item => item.key === flag && item.value === true)) {
      return flag
    }
  }
  return undefined
}

function hasSayFlagSelect(node: SayCommandNode, key: string): boolean | typeof NOT_HANDLED {
  if (key === 'figurePosition') {
    return node.figurePosition !== undefined
  }
  if ((FIGURE_POSITION_FLAGS as readonly string[]).includes(key)) {
    return node.figurePosition === key
  }
  if (key === 'speaker') {
    return node.speaker.trim().length > 0
  }
  return NOT_HANDLED
}

// ─── 字段读取核心 ───────────────────────────────────

function readFromFieldTable(
  node: CommandNode,
  key: string,
  overrideType?: string,
): ParamValue | typeof NOT_HANDLED {
  if (node.type === commandType.say) {
    const flagResult = readSayFlagSelect(node as SayCommandNode, key)
    if (flagResult !== NOT_HANDLED) {
      return flagResult
    }
  }
  if (isGenericNode(node)) {
    const positionResult = readChangeFigurePosition(node, key)
    if (positionResult !== NOT_HANDLED) {
      return positionResult
    }
  }

  const meta = getRegistryMeta(node.type).get(key)
  if (!meta) {
    return NOT_HANDLED
  }

  let effectiveKind: FieldKind = meta.kind
  if (overrideType === 'number') {
    effectiveKind = 'number'
  } else if (overrideType === 'switch') {
    effectiveKind = 'boolean'
  }

  const fieldName = meta.field ?? key
  if (isGenericNode(node)) {
    const found = node.args.find(item => item.key === key)
    if (!found) {
      return undefined
    }
    if (effectiveKind === 'boolean') {
      return found.value === true ? true : undefined
    }
    // WebGAL 解析器中 arg.value === true 表示该参数是无值 flag（如 -next），
    // 对于 string/number 类型字段，flag 形式无法提供有效值，返回 undefined
    if (effectiveKind === 'number') {
      if (found.value === true) {
        return undefined
      }
      const numberValue = Number(found.value)
      return Number.isFinite(numberValue) ? numberValue : undefined
    }
    if (found.value === true) {
      return undefined
    }
    return String(found.value)
  }
  return (node as unknown as Record<string, unknown>)[fieldName] as ParamValue
}

function hasFromFieldTable(
  node: CommandNode,
  key: string,
): boolean | typeof NOT_HANDLED {
  if (node.type === commandType.say) {
    const flagResult = hasSayFlagSelect(node as SayCommandNode, key)
    if (flagResult !== NOT_HANDLED) {
      return flagResult
    }
  }

  const value = readFromFieldTable(node, key)
  if (value === NOT_HANDLED) {
    return NOT_HANDLED
  }

  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return true
  }
  if (typeof value === 'string') {
    return value.trim() !== ''
  }
  return value !== undefined
}

// ─── extraArgs 查找 ─────────────────────────────────

function findExtraArgValue(node: CommandNode, key: string): string | boolean | number | undefined {
  if ('extraArgs' in node) {
    const found = node.extraArgs.find(item => item.key === key)
    return found?.value
  }
  if ('args' in node) {
    const found = node.args.find(item => item.key === key)
    return found?.value
  }
  return undefined
}

function hasExtraArg(node: CommandNode, key: string): boolean {
  if ('extraArgs' in node) {
    return node.extraArgs.some(item => item.key === key)
  }
  if ('args' in node) {
    return node.args.some(item => item.key === key)
  }
  return false
}

// ─── 公共 API ───────────────────────────────────────

export function readCommandNodeParamValue(
  node: CommandNode,
  paramDef: CommandParamDescriptor,
): string | boolean | number | undefined {
  const knownValue = readFromFieldTable(node, paramDef.key, paramDef.type)
  if (knownValue !== NOT_HANDLED) {
    return knownValue
  }
  return findExtraArgValue(node, paramDef.key)
}

export function hasCommandNodeParam(node: CommandNode, key: string): boolean {
  const knownResult = hasFromFieldTable(node, key)
  if (knownResult !== NOT_HANDLED) {
    return knownResult
  }
  return hasExtraArg(node, key)
}
