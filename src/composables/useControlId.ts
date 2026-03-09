function normalizeIdSegment(segment: string): string {
  const normalized = segment
    .trim()
    .replaceAll(/[^a-zA-Z0-9_-]/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-+|-+$/g, '')

  return normalized || 'field'
}

export function useControlId(namespace: string) {
  const prefix = `${normalizeIdSegment(namespace)}-${useId()}`

  function buildControlId(key: string): string {
    return `${prefix}-${normalizeIdSegment(key)}`
  }

  return { buildControlId }
}
