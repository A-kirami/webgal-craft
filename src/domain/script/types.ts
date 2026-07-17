import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { ChooseContentItem, StyleRuleContentItem } from '~/domain/script/content'

import type { arg } from 'webgal-parser/src/interface/sceneInterface'

export interface CommandNodeBase<T extends commandType> {
  type: T
  commandRaw: string
  inlineComment: string
}

export interface SayCommandNode extends CommandNodeBase<commandType.say> {
  text: string
  speaker: string
  clear: boolean
  fontSize?: string
  vocal?: string
  volume?: number
  figurePosition?: SayFigurePosition
  figureId?: string
  next: boolean
  continue: boolean
  concat: boolean
  notend: boolean
  extraArgs: arg[]
}

export interface CommentCommandNode extends CommandNodeBase<commandType.comment> {
  text: string
  extraArgs: arg[]
}

export interface SetVarCommandNode extends CommandNodeBase<commandType.setVar> {
  name: string
  value: string
  global: boolean
  extraArgs: arg[]
}

export interface ChooseCommandNode extends CommandNodeBase<commandType.choose> {
  choices: ChooseContentItem[]
  extraArgs: arg[]
}

export interface ApplyStyleCommandNode extends CommandNodeBase<commandType.applyStyle> {
  rules: StyleRuleContentItem[]
  extraArgs: arg[]
}

export type TypedCommandNode =
  | SayCommandNode
  | CommentCommandNode
  | SetVarCommandNode
  | ChooseCommandNode
  | ApplyStyleCommandNode

export type TypedCommandType = TypedCommandNode['type']

export type GenericCommandType = Exclude<commandType, TypedCommandType>

export interface GenericCommandNode extends CommandNodeBase<GenericCommandType> {
  content: string
  args: arg[]
}

export type CommandNode = TypedCommandNode | GenericCommandNode

// ─── 共享常量与类型守卫 ────────────────────────────

export const SAY_FIGURE_POSITIONS = ['left', 'center', 'right'] as const
export type SayFigurePosition = (typeof SAY_FIGURE_POSITIONS)[number]

export const FIGURE_POSITION_TARGET_IDS = {
  left: 'fig-left',
  center: 'fig-center',
  right: 'fig-right',
} as const satisfies Record<SayFigurePosition, string>

export function isGenericNode(node: CommandNode): node is GenericCommandNode {
  return 'args' in node
}
