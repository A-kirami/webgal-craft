export interface SearchOptionItem {
  label: string
  value: string
}

export interface SearchOptionDocument {
  label: string
  originalIndex: number
  pathText: string
  value: string
}

function normalizeSearchOptionLabel(option: SearchOptionItem): string {
  return option.label || option.value
}

function tokenizeSearchQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

export function createSearchOptionDocuments(
  options: SearchOptionItem[],
): SearchOptionDocument[] {
  return options.map((option, index) => {
    const label = normalizeSearchOptionLabel(option)

    return {
      label,
      originalIndex: index,
      pathText: label,
      value: option.value,
    }
  })
}

export function filterSearchOptionDocuments(
  documents: SearchOptionDocument[],
  query: string,
): SearchOptionDocument[] {
  const tokens = tokenizeSearchQuery(query)
  if (tokens.length === 0) {
    return documents
  }

  return documents.filter((document) => {
    const normalizedPathText = document.pathText.toLowerCase()
    return tokens.every(token => normalizedPathText.includes(token))
  })
}
