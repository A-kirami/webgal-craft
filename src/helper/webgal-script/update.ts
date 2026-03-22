import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { cloneArgs } from '~/helper/webgal-script/codec'
import { parseChooseContent, parseSetVarContent, parseStyleRuleContent } from '~/helper/webgal-script/content'
import { CommandParamDescriptor, getRegistryKnownKeys, resolveRegistryFieldMeta } from '~/helper/webgal-script/params'
import { CommandNode, FIGURE_POSITION_FLAGS, GenericCommandNode, isGenericNode, TypedCommandNode } from '~/helper/webgal-script/types'

import type { arg } from 'webgal-parser/src/interface/sceneInterface'

const NOT_HANDLED = Symbol('command-param-not-handled')

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

function updateSayFigurePosition(node: CommandNode, newValue: ParamUpdateValue): CommandNode {
  const value = String(newValue)
  return {
    ...node,
    figurePosition: (FIGURE_POSITION_FLAGS as readonly string[]).includes(value) ? value : undefined,
  } as CommandNode
}

function updateChangeFigurePosition(node: CommandNode, newValue: ParamUpdateValue): CommandNode {
  if (!isGenericNode(node)) {
    return node
  }

  const value = String(newValue)
  const nextArgs = cloneArgs(node.args)
  // 记录原 flag 位置后再删除所有旧 flag，新 flag 插入到原位置，
  // 保持 args 数组中参数的相对顺序不变，避免序列化后脚本文本产生无意义 diff
  const firstFlagIndex = nextArgs.findIndex(item => item.key === 'left' || item.key === 'right')

  for (let index = nextArgs.length - 1; index >= 0; index--) {
    if (nextArgs[index].key === 'left' || nextArgs[index].key === 'right') {
      nextArgs.splice(index, 1)
    }
  }

  if (value === 'left' || value === 'right') {
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

function updateFromFieldTable(
  node: CommandNode,
  paramDef: CommandParamDescriptor,
  newValue: ParamUpdateValue,
): CommandNode | typeof NOT_HANDLED {
  if (node.type === commandType.say && paramDef.key === 'figurePosition') {
    return updateSayFigurePosition(node, newValue)
  }
  if (node.type === commandType.changeFigure && paramDef.key === 'position') {
    return updateChangeFigurePosition(node, newValue)
  }

  const meta = resolveRegistryFieldMeta(node.type, paramDef.key)
  if (!meta) {
    return NOT_HANDLED
  }

  // paramDef.type 是调用方声明的存储类型，优先于注册表的 kind
  // （如 delayTime 在注册表中是 choice 但存储为 number）
  let storageKind: string = meta.kind
  if (paramDef.type === 'number') {
    storageKind = 'number'
  } else if (paramDef.type === 'switch') {
    storageKind = 'boolean'
  }

  if (isGenericNode(node)) {
    const nextArgs = cloneArgs(node.args)
    const knownKeys = getRegistryKnownKeys(node.type)

    switch (storageKind) {
      case 'boolean': {
        removeArgByKey(nextArgs, paramDef.key)
        if (newValue === true) {
          upsertArgValue(nextArgs, paramDef.key, true, knownKeys)
        }
        return { ...node, args: nextArgs }
      }
      case 'number': {
        const numberValue = isUnsetValue(paramDef, newValue) ? undefined : toOptionalNumber(newValue)
        if (numberValue === undefined) {
          removeArgByKey(nextArgs, paramDef.key)
        } else {
          upsertArgValue(nextArgs, paramDef.key, numberValue, knownKeys)
        }
        return { ...node, args: nextArgs }
      }
      case 'string': {
        if (isUnsetValue(paramDef, newValue)) {
          removeArgByKey(nextArgs, paramDef.key)
          return { ...node, args: nextArgs }
        }
        upsertArgValue(nextArgs, paramDef.key, String(newValue), knownKeys)
        return { ...node, args: nextArgs }
      }
      default: {
        return NOT_HANDLED
      }
    }
  }

  const fieldName = meta.field ?? paramDef.key
  let resolvedValue: unknown

  switch (storageKind) {
    case 'boolean': {
      resolvedValue = newValue === true
      break
    }
    case 'number': {
      resolvedValue = isUnsetValue(paramDef, newValue) ? undefined : toOptionalNumber(newValue)
      break
    }
    case 'string': {
      resolvedValue = isUnsetValue(paramDef, newValue) ? undefined : String(newValue)
      break
    }
    default: {
      return NOT_HANDLED
    }
  }

  return { ...node, [fieldName]: resolvedValue } as CommandNode
}

export function updateCommandNodeParam(
  node: CommandNode,
  paramDef: CommandParamDescriptor,
  newValue: ParamUpdateValue,
): CommandNode | undefined {
  const result = updateFromFieldTable(node, paramDef, newValue)
  if (result === NOT_HANDLED) {
    return undefined
  }
  return result
}
