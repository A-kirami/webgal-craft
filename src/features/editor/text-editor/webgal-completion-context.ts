export type WebgalArgumentCompletionTarget = {
  kind: 'none'
} | {
  kind: 'key'
  hasLeadingDash: boolean
  startOffset: number
  endOffset: number
} | {
  kind: 'value'
  key: string
  prefix: string
  startOffset: number
}

export function resolveWebgalArgumentCompletionTarget(
  line: string,
  cursorOffset: number,
): WebgalArgumentCompletionTarget {
  const beforeCursor = line.slice(0, cursorOffset)
  const valueMatch = beforeCursor.match(/(?:^|\s)-([\w.-]+)=([^;\s]*)$/)
  if (valueMatch) {
    const prefix = valueMatch[2]!
    return {
      kind: 'value',
      key: valueMatch[1]!,
      prefix,
      startOffset: cursorOffset - prefix.length,
    }
  }

  const keyMatch = beforeCursor.match(/(?:^|\s)(-?)([\w.-]*)$/)
  if (!keyMatch) {
    return { kind: 'none' }
  }

  const hasLeadingDash = keyMatch[1] === '-'
  const hasStartedArgumentRegion = /(?:^|\s)-[\w.-]+/.test(beforeCursor)
  if (!hasLeadingDash && !hasStartedArgumentRegion) {
    return { kind: 'none' }
  }

  const keyPrefix = keyMatch[2]!
  const keySuffix = line.slice(cursorOffset).match(/^[\w.-]*(?:=)?/)?.[0] ?? ''
  return {
    kind: 'key',
    hasLeadingDash,
    startOffset: cursorOffset - keyPrefix.length,
    endOffset: cursorOffset + keySuffix.length,
  }
}
