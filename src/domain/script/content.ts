export interface SetVarContent {
  name: string
  value: string
}

export interface ChooseContentItem {
  name: string
  file: string
}

export interface StyleRuleContentItem {
  oldName: string
  newName: string
}

function parsePair(raw: string, separator: string): [string, string] {
  const idx = raw.indexOf(separator)
  if (idx === -1) {
    return [raw, '']
  }
  return [raw.slice(0, idx), raw.slice(idx + separator.length)]
}

export function parseSetVarContent(content: string): SetVarContent {
  const [name, value] = parsePair(content, '=')
  return { name, value }
}

export function stringifySetVarContent(name: string, value: string): string {
  return `${name}=${value}`
}

export function parseChooseContent(content: string): ChooseContentItem[] {
  return content
    .split('|')
    .filter(Boolean)
    .map((item) => {
      const [name, file] = parsePair(item, ':')
      return { name, file }
    })
}

export function stringifyChooseContent(items: ChooseContentItem[]): string {
  return items.map(item => `${item.name}:${item.file}`).join('|')
}

export function parseStyleRuleContent(content: string): StyleRuleContentItem[] {
  return content
    .split(',')
    .filter(Boolean)
    .map((rule) => {
      const [oldName, newName] = parsePair(rule, '->')
      return { oldName, newName }
    })
}

export function stringifyStyleRuleContent(items: StyleRuleContentItem[]): string {
  return items.map(item => `${item.oldName}->${item.newName}`).join(',')
}
