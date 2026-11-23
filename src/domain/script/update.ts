import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { cloneArgs } from '~/domain/script/codec'
import { parseChooseContent, parseSetVarContent, parseStyleRuleContent } from '~/domain/script/content'
import { CommandParamDescriptor, getRegistryDependentKeys, getRegistryKnownKeys, resolveRegistryFieldKind } from '~/domain/script/params'
import { updateSayFigureTargetId } from '~/domain/script/say-figure'
import { CallSceneCommandNode, CHANGE_FIGURE_POSITION_FLAGS, CommandNode, FIGURE_POSITION_FLAG_COMMANDS, GenericCommandNode, isGenericNode, TypedCommandNode } from '~/domain/script/types'

import type { arg } from 'webgal-parser/src/interface/sceneInterface'

type ControlFlagKey = 'next' | 'continue' | 'keep'

function getConflictingControlFlags(key: string): readonly ControlFlagKey[] {
  if (key === 'next') {
    return ['continue']
  }
  if (key === 'continue') {
    return ['next', 'keep']
  }
  if (key === 'keep') {
    return ['continue']
  }
  return []
}

type ParamUpdateValue = string | boolean | number

// 判断新值是否等效于"未设置"：
// switch 类型只有 true 才算"已设置"；
// 其他类型空字符串或等于默认值都视为"未设置"，
// 未设置的参数在序列化时会从 args 中移除以保持脚本简洁
function isUnsetValue(paramDef: CommandParamDescriptor, newValue: ParamUpdateValue): boolean {
  if (paramDef.type === 'switch') {
    return newValue !== true
  }
  const stringValue = String(newValue)
  return !stringValue || (paramDef.defaultValue !== undefined && stringValue === String(paramDef.defaultValue))
}

function toOptionalNumber(value: ParamUpdateValue): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function updateChangeFigurePosition(node: CommandNode, newValue: ParamUpdateValue): CommandNode {
  if (!isGenericNode(node)) {
    return node
  }

  const value = String(newValue)
  const nextArgs = cloneArgs(node.args)
  // 记录原 flag 位置后再删除所有旧 flag，新 flag 插入到原位置，
  // 保持 args 数组中参数的相对顺序不变，避免序列化后脚本文本产生无意义 diff
  const firstFlagIndex = nextArgs.findIndex(item => (CHANGE_FIGURE_POSITION_FLAGS as readonly string[]).includes(item.key))

  for (let index = nextArgs.length - 1; index >= 0; index--) {
    if ((CHANGE_FIGURE_POSITION_FLAGS as readonly string[]).includes(nextArgs[index].key)) {
      nextArgs.splice(index, 1)
    }
  }

  if ((CHANGE_FIGURE_POSITION_FLAGS as readonly string[]).includes(value)) {
    nextArgs.splice(firstFlagIndex === -1 ? nextArgs.length : firstFlagIndex, 0, { key: value, value: true })
  }

  return { ...node, args: nextArgs }
}

function removeArgByKey(args: GenericCommandNode['args'], key: string): void {
  for (let index = args.length - 1; index >= 0; index--) {
    if (args[index].key === key) {
      args.splice(index, 1)
    }
  }
}

function upsertArgValue(
  args: GenericCommandNode['args'],
  key: string,
  value: string | number | true,
  knownKeys: Set<string>,
): void {
  const firstIndex = args.findIndex(item => item.key === key)

  if (firstIndex === -1) {
    const firstUnknownIndex = args.findIndex(item => !knownKeys.has(item.key))
    // 新参数插入到第一个"未知参数"之前（即已知参数区域的末尾），
    // 保持已知参数在前、未知参数（extraArgs）在后的约定顺序
    args.splice(firstUnknownIndex === -1 ? args.length : firstUnknownIndex, 0, { key, value })
    return
  }

  args[firstIndex] = { key, value }
  for (let index = args.length - 1; index > firstIndex; index--) {
    if (args[index].key === key) {
      args.splice(index, 1)
    }
  }
}

export function updateCommandNodeContent(
  node: CommandNode,
  newContent: string,
): CommandNode {
  switch (node.type) {
    case commandType.say:
    case commandType.comment: {
      return { ...node, text: newContent }
    }

    case commandType.setVar: {
      const parsed = parseSetVarContent(newContent)
      return { ...node, name: parsed.name, value: parsed.value }
    }
    case commandType.choose: {
      return { ...node, choices: parseChooseContent(newContent) }
    }
    case commandType.applyStyle: {
      return { ...node, rules: parseStyleRuleContent(newContent) }
    }

    case commandType.callScene: {
      return { ...node, file: newContent }
    }

    case commandType.return: {
      return { ...node, value: newContent }
    }

    default: {
      if ('content' in node) {
        return { ...node, content: newContent }
      }
      return node
    }
  }
}

export function updateCommandNodeInlineComment(
  node: CommandNode,
  inlineComment: string,
): CommandNode {
  return {
    ...node,
    inlineComment,
  }
}

export function updateCommandNodeSpeaker(
  node: CommandNode,
  speaker: string,
): CommandNode | undefined {
  if (node.type !== commandType.say) {
    return
  }
  return {
    ...node,
    speaker,
  }
}

export function readTypedCommandNodeExtraArgs(node: TypedCommandNode): arg[] {
  return cloneArgs(node.extraArgs)
}

export function updateTypedCommandNodeExtraArgs(
  node: TypedCommandNode,
  extraArgs: arg[],
): TypedCommandNode {
  return {
    ...node,
    extraArgs: cloneArgs(extraArgs),
  }
}

const CALL_SCENE_MANAGED_ARG_KEYS = new Set(['next', 'continue', 'writeReturnTo', 'when'])

export function isCallSceneManagedArgKey(key: string): boolean {
  return CALL_SCENE_MANAGED_ARG_KEYS.has(key)
}

export function readCallSceneCustomArgs(node: CommandNode): arg[] {
  if (node.type !== commandType.callScene) {
    return []
  }

  // callScene 参数表将裸参数视为未填写值。
  return node.extraArgs
    .filter(item => !isCallSceneManagedArgKey(item.key))
    .map(item => ({ ...item, value: item.value === true ? '' : item.value }))
}

export function updateCallSceneCustomArgs(
  node: CallSceneCommandNode,
  customArgs: arg[],
): CallSceneCommandNode {
  const preservedArgs = node.extraArgs.filter(item => isCallSceneManagedArgKey(item.key))
  const editableArgs = customArgs
    .filter(item => item.key.trim() !== '' && !isCallSceneManagedArgKey(item.key))
    .map(item => ({ ...item, value: item.value === '' ? true : item.value }))
  return {
    ...node,
    extraArgs: [...cloneArgs(preservedArgs), ...editableArgs],
  }
}

export function updateCommandNodeParam(
  node: CommandNode,
  paramDef: CommandParamDescriptor,
  newValue: ParamUpdateValue,
): CommandNode | undefined {
  const { key } = paramDef

  if (node.type === commandType.say && key === 'figureId') {
    return updateSayFigureTargetId(node, String(newValue))
  }

  if (isGenericNode(node) && FIGURE_POSITION_FLAG_COMMANDS.includes(node.type) && key === 'position') {
    return updateChangeFigurePosition(node, newValue)
  }

  if (
    node.type === commandType.setVar
    && key === 'scope'
    && paramDef.type === 'select'
  ) {
    const scope = String(newValue)
    return {
      ...node,
      global: scope === 'global',
      local: scope === 'local',
    }
  }

  if (
    node.type === commandType.setVar
    && (key === 'global' || key === 'local')
    && paramDef.type === 'switch'
  ) {
    const enabled = newValue === true
    const conflictingKey = key === 'global' ? 'local' : 'global'
    return {
      ...node,
      [key]: enabled,
      ...(enabled && { [conflictingKey]: false }),
    }
  }

  let storageKind = resolveRegistryFieldKind(node.type, key)
  if (!storageKind) {
    return
  }

  // paramDef.type 是调用方声明的存储类型，优先于注册表的 kind
  // （如 delayTime 在注册表中是 choice 但存储为 number）
  if (paramDef.type === 'number') {
    storageKind = 'number'
  } else if (paramDef.type === 'switch') {
    storageKind = 'boolean'
  }

  let value: string | number | true | undefined
  if (storageKind === 'boolean') {
    value = newValue === true ? true : undefined
  } else if (!isUnsetValue(paramDef, newValue)) {
    value = storageKind === 'number' ? toOptionalNumber(newValue) : String(newValue)
  }

  const genericNode = isGenericNode(node)
  if (!genericNode && key !== 'when') {
    return { ...node, [key]: storageKind === 'boolean' ? value === true : value } as CommandNode
  }

  const args = cloneArgs(genericNode ? node.args : node.extraArgs)
  const knownKeys = getRegistryKnownKeys(node.type)
  if (storageKind === 'boolean') {
    removeArgByKey(args, key)
    if (value === true) {
      for (const conflictingKey of getConflictingControlFlags(key)) {
        if (knownKeys.has(conflictingKey)) {
          removeArgByKey(args, conflictingKey)
        }
      }
      upsertArgValue(args, key, true, knownKeys)
    } else {
      // 引擎按参数是否存在启停口型 / 眨眼，关闭分组开关时同时清除依赖参数。
      for (const dependentKey of getRegistryDependentKeys(node.type, key)) {
        removeArgByKey(args, dependentKey)
      }
    }
  } else if (value === undefined) {
    removeArgByKey(args, key)
  } else {
    upsertArgValue(args, key, value, knownKeys)
  }
  return genericNode ? { ...node, args } : { ...node, extraArgs: args }
}
