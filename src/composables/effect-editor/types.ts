/** emitTransform 的调度选项 */
export interface EmitTransformOptions {
  schedule: 'continuous' | 'color' | 'immediate'
  deferAutoApply?: boolean
  flush?: boolean
}

/** 所有效果编辑器控件共享的依赖接口 */
export interface EffectControlDeps {
  getFields: () => Record<string, string>
  getFieldValue: (path: string) => string
  getNumberValue: (path: string, fallback: number) => number
  setNumericField: (fields: Record<string, string>, path: string, value: number) => void
  emitTransform: (fields: Record<string, string>, options: EmitTransformOptions) => void
}
