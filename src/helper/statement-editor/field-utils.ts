// ─── 事件工具 ────────────────────────────────────

export function normalizeFieldStringValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  return String(value)
}

/**
 * 将字段值转换为可绑定到输入控件的字符串。
 * 与 normalizeFieldStringValue 不同，这里将 false 视为“未设置”，用于避免输入框显示 "false"。
 */
export function resolveFieldModelStringValue(value?: unknown): string {
  if (value === null || value === undefined || value === false) {
    return ''
  }
  return String(value)
}

export function resolvePanelSliderEmitValue(values?: number[]): string | undefined {
  const first = values?.[0]
  if (first === undefined || Number.isNaN(first)) {
    return
  }
  return String(first)
}
