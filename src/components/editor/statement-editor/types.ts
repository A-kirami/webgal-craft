import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { ChooseContentItem, SetVarContent, StyleRuleContentItem } from '~/domain/script/content'
import type { EditorField } from '~/features/editor/command-registry/schema'

export interface ValueBinding<T> {
  readonly value: T
}

export type StatementSpecialContentMode = 'applyStyle' | 'choose' | 'setVar'

export interface StatementSpecialContentBindings {
  choose: ValueBinding<ChooseContentItem[]>
  setVar: ValueBinding<SetVarContent>
  styleRules: ValueBinding<StyleRuleContentItem[]>
  handleSetVarNameChange: (value: string) => void
  handleSetVarValueChange: (value: string) => void
  handleChooseNameChange: (index: number, value: string) => void
  handleChooseFileChange: (index: number, file: string) => void
  handleRemoveChooseItem: (index: number) => void
  handleAddChooseItem: () => void
  handleStyleOldNameChange: (index: number, value: string) => void
  handleStyleNewNameChange: (index: number, value: string) => void
  handleRemoveStyleRule: (index: number) => void
  handleAddStyleRule: () => void
}

export interface StatementParamRendererSharedProps {
  canScrub: (field: EditorField) => boolean
  fileRootPaths: Record<string, string>
  getDynamicOptions: (field: EditorField) => { label: string, value: string }[]
  getFieldSelectValue: (field: EditorField) => string
  getFieldValue: (field: EditorField) => string | number | boolean
  isFieldCustom: (field: EditorField) => boolean
  isFieldFileMissing: (field: EditorField) => boolean
  isFieldVisible: (field: EditorField) => boolean
  parsed?: ISentence
}

export interface ParamRendererValuePayload {
  field: EditorField
  value: string | number | boolean
}

export interface ParamRendererSelectPayload {
  field: EditorField
  value: string
}

export interface ParamRendererLabelPointerPayload {
  event: PointerEvent
  field: EditorField
}

export interface ParamRendererCommitSliderPayload {
  event: Event
  field: EditorField
}
