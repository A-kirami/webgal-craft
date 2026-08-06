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
  defaultChoose?: number
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

export const SAY_FIGURE_POSITIONS = ['left', 'left14', 'left13', 'center', 'right13', 'right14', 'right'] as const
export type SayFigurePosition = (typeof SAY_FIGURE_POSITIONS)[number]

export const CHANGE_FIGURE_POSITION_FLAGS = ['left', 'left14', 'left13', 'right13', 'right14', 'right'] as const

export const EXTENDED_FIGURE_POSITIONS = ['left13', 'left14', 'right13', 'right14'] as const
export type ExtendedFigurePosition = (typeof EXTENDED_FIGURE_POSITIONS)[number]

export const FIGURE_POSITION_TARGET_IDS = {
  left: 'fig-left',
  left14: 'fig-left14',
  left13: 'fig-left13',
  center: 'fig-center',
  right13: 'fig-right13',
  right14: 'fig-right14',
  right: 'fig-right',
} as const satisfies Record<SayFigurePosition, string>

const EXTENDED_FIGURE_POSITION_TARGET_IDS = new Set<string>(
  EXTENDED_FIGURE_POSITIONS.map(position => FIGURE_POSITION_TARGET_IDS[position]),
)

export function isExtendedFigurePosition(value: string): value is ExtendedFigurePosition {
  return (EXTENDED_FIGURE_POSITIONS as readonly string[]).includes(value)
}

export function isExtendedFigurePositionTargetId(value: string): boolean {
  return EXTENDED_FIGURE_POSITION_TARGET_IDS.has(value)
}

export function isGenericNode(node: CommandNode): node is GenericCommandNode {
  return 'args' in node
}
