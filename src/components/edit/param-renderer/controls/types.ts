import { StatementEditorSurface } from '~/helper/statement-editor/surface-context'

export interface ParamSelectOptionItem {
  iconClass?: string
  label: string
  value: string
}

export interface ParamControlCommonProps {
  customOptionLabel: string
  dynamicOptions?: ParamSelectOptionItem[]
  fileRootPath: string
  fileTitle: string
  notSelectedLabel: string
  options: ParamSelectOptionItem[]
  paramDef: { key: string, type: string }
  placeholder: string
  selectValue: string
  surface: StatementEditorSurface
  unitLabel: string
  value: string | number | boolean
  variant?: string
}
