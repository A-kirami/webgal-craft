import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { readSayFigureTargetId } from '~/domain/script/say-figure'
import { CHANGE_FIGURE_POSITION_FLAGS, CommandNode, FIGURE_POSITION_FLAG_COMMANDS, GenericCommandNode, isGenericNode } from '~/domain/script/types'
import { getCommandConfig } from '~/features/editor/command-registry/index'
import { isFlagChoiceField, readAllArgFields, readArgFieldStorageKey, UNSPECIFIED } from '~/features/editor/command-registry/schema'

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

interface RegistryIndex {
  /** argKey → 参数的存储类型 */
  kinds: Map<string, FieldKind>
  /** 分组开关 key → 声明 visibleWhen.value === true 的参数 storage key */
  dependents: Map<string, string[]>
}

/** 注册表索引缓存：commandType → 由注册表字段派生的存储元信息 */
const registryIndexCache = new Map<commandType, RegistryIndex>()

function getRegistryIndex(type: commandType): RegistryIndex {
  let cached = registryIndexCache.get(type)
  if (cached) {
    return cached
  }

  const kinds = new Map<string, FieldKind>()
  const dependents = new Map<string, string[]>()

  for (const af of readAllArgFields(getCommandConfig(type))) {
    const { visibleWhen } = af.field
    // visibleWhen.value === true 的字段是该分组开关的成员：开关关闭后它不再可见，
    // 但引擎只按参数是否存在启停，残留参数会继续生效，这里记录成员关系供 update.ts 清除
    if (visibleWhen?.value === true) {
      const storageKey = readArgFieldStorageKey(af)
      const group = dependents.get(visibleWhen.key)
      if (!group) {
        dependents.set(visibleWhen.key, [storageKey])
      } else if (!group.includes(storageKey)) {
        group.push(storageKey)
      }
    }

    // 存储元信息与展示能力无关：hiddenWhenCapability 隐藏的字段仍是已知参数，
    // 否则隐藏会改变参数顺序与未知参数判定
    if (af.jsonMeta) {
      // json-object 子字段不进入字段类型索引：
      // 原始 arg（如 blink）通过 findExtraArgValue 读取，
      // 子字段（如 blinkInterval）由 statement-editor 层的 readJsonFieldValue 处理
    } else if (af.field.type === 'choice' && isFlagChoiceField(af.field)) {
      // flag choice 字段由其专用路径处理，不进入字段类型索引
    } else {
      kinds.set(af.field.key, fieldTypeToKind(af.field.type))
    }
  }

  cached = { kinds, dependents }
  registryIndexCache.set(type, cached)
  return cached
}

export function resolveRegistryFieldKind(type: commandType, key: string): FieldKind | undefined {
  return getRegistryIndex(type).kinds.get(key)
}

/**
 * 供 update.ts 使用：获取注册表中 visibleWhen 要求 key 为 true 的参数 storage key。
 * 关闭分组开关时必须一并清除这些参数，否则语句里会残留口型 / 眨眼图，
 * 引擎按「图片参数非空」启停，界面显示已关闭却仍在演出。
 */
export function getRegistryDependentKeys(type: commandType, key: string): readonly string[] {
  return getRegistryIndex(type).dependents.get(key) ?? []
}

/** 供 update.ts 使用：获取注册表中某命令的所有已知 arg key */
export function getRegistryKnownKeys(type: commandType): Set<string> {
  const keys = new Set(getRegistryIndex(type).kinds.keys())
  // 图片立绘命令的位置是 flag-choice 的选项值而非独立参数 key，
  // 不在字段类型索引中，但在 args 数组中以 { key: 'left', value: true } 形式存在，
  // 需要手动补充以确保 upsertArgValue 能正确判断已知/未知参数的插入位置
  if (FIGURE_POSITION_FLAG_COMMANDS.includes(type)) {
    for (const flag of CHANGE_FIGURE_POSITION_FLAGS) {
      keys.add(flag)
    }
  }
  return keys
}

// ─── typed node 特殊路径 ────────────────────────────

function readChangeFigurePosition(node: GenericCommandNode, paramKey: string): ParamValue | typeof NOT_HANDLED {
  if (!FIGURE_POSITION_FLAG_COMMANDS.includes(node.type) || paramKey !== 'position') {
    return NOT_HANDLED
  }
  for (const flag of CHANGE_FIGURE_POSITION_FLAGS) {
    if (node.args.some(item => item.key === flag && item.value === true)) {
      return flag
    }
  }
  return undefined
}

function readSetVarScope(node: CommandNode, key: string): ParamValue | typeof NOT_HANDLED {
  if (node.type !== commandType.setVar || key !== 'scope') {
    return NOT_HANDLED
  }
  if (node.global) {
    return 'global'
  }
  if (node.local) {
    return 'local'
  }
  return UNSPECIFIED
}

// ─── 字段读取核心 ───────────────────────────────────

function readFromFieldTable(
  node: CommandNode,
  key: string,
  overrideType?: string,
): ParamValue | typeof NOT_HANDLED {
  const setVarScope = readSetVarScope(node, key)
  if (setVarScope !== NOT_HANDLED) {
    return setVarScope
  }

  if (node.type === commandType.say && key === 'figureId') {
    return readSayFigureTargetId(node)
  }

  if (isGenericNode(node)) {
    const positionResult = readChangeFigurePosition(node, key)
    if (positionResult !== NOT_HANDLED) {
      return positionResult
    }
  }

  let effectiveKind = resolveRegistryFieldKind(node.type, key)
  if (!effectiveKind) {
    return NOT_HANDLED
  }

  if (overrideType === 'number') {
    effectiveKind = 'number'
  } else if (overrideType === 'switch') {
    effectiveKind = 'boolean'
  }

  const genericNode = isGenericNode(node)
  // 执行条件在类型化节点中也保存在参数列表，不映射为节点属性。
  if (!genericNode && key !== 'when') {
    return (node as unknown as Record<string, unknown>)[key] as ParamValue
  }

  const args = genericNode ? node.args : node.extraArgs
  const found = args.find(item => item.key === key)
  if (!found) {
    return undefined
  }
  if (effectiveKind === 'boolean') {
    return found.value === true ? true : undefined
  }
  // arg.value === true 表示无值 flag（如 -next），不是文本或数值参数。
  if (found.value === true) {
    return undefined
  }
  if (effectiveKind === 'number') {
    const numberValue = Number(found.value)
    return Number.isFinite(numberValue) ? numberValue : undefined
  }
  return String(found.value)
}

function hasFromFieldTable(
  node: CommandNode,
  key: string,
): boolean | typeof NOT_HANDLED {
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
