import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { ChooseContentItem, SetVarContent, StyleRuleContentItem } from '~/domain/script/content'
import type { ResolvedAutocompleteOption } from '~/features/editor/command-registry/autocomplete-options'
import type { EditorField } from '~/features/editor/command-registry/schema'
import type { EditorFieldDiagnostic } from '~/features/editor/diagnostics/types'

export interface ValueBinding<T> {
  readonly value: T
}

export type StatementSpecialContentMode = 'applyStyle' | 'choose' | 'setVar'

export interface StatementSpecialContentBindings {
  choose: ValueBinding<ChooseContentItem[]>
  defaultChooseIndex: ValueBinding<number | undefined>
  setVar: ValueBinding<SetVarContent>
  styleRules: ValueBinding<StyleRuleContentItem[]>
  handleSetVarNameChange: (value: string) => void
  handleSetVarValueChange: (value: string) => void
  handleChooseNameChange: (index: number, value: string) => void
  handleChooseFileChange: (index: number, file: string) => void
  handleChooseDefaultChange: (index: number) => void
  handleRemoveChooseItem: (index: number) => void
  handleAddChooseItem: () => void
  handleStyleOldNameChange: (index: number, value: string) => void
  handleStyleNewNameChange: (index: number, value: string) => void
  handleRemoveStyleRule: (index: number) => void
  handleAddStyleRule: () => void
  getChoiceDiagnostics: (index: number) => readonly EditorFieldDiagnostic[]
}

export interface StatementParamRendererSharedProps {
  canScrub: (field: EditorField) => boolean
  fileRootPaths: Record<string, string>
  getAutocompleteOptions: (field: EditorField) => ResolvedAutocompleteOption[]
  getDynamicOptions: (field: EditorField) => { label: string, value: string }[]
  getFieldSelectOptions: (field: EditorField) => { label: string, value: string }[]
  getFieldSelectValue: (field: EditorField) => string
  getFieldValue: (field: EditorField) => string | number | boolean
  getFieldDiagnostics: (field: EditorField) => readonly EditorFieldDiagnostic[]
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
