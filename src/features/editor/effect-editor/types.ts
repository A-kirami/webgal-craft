/** emitTransform 的提交选项 */
export interface EmitTransformOptions {
  deferAutoApply?: boolean
  frameReady?: boolean
  flush?: boolean
}

/** 所有效果编辑器控件共享的依赖接口 */
export interface EffectControlDeps {
  getFields: () => Record<string, string>
  getFieldValue: (path: string) => string
  getStoredFieldValue: (path: string) => string | undefined
  getNumberValue: (path: string, fallback: number) => number
  setNumericField: (fields: Record<string, string>, path: string, value: number) => void
  emitTransform: (fields: Record<string, string>, options: EmitTransformOptions) => void
  cancelPreview?: () => void | Promise<void>
}
