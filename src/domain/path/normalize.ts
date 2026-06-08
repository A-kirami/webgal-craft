export class PathError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PathError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export function normalizePosix(raw: string): string {
  // eslint-disable-next-line no-restricted-syntax -- normalizePosix 是路径规范化入口，需要在此统一转换分隔符。
  const source = raw.replaceAll('\\', '/')
  const uncPrefix = source.startsWith('//') && !source.startsWith('///')
  const absolutePrefix = source.startsWith('/') && !uncPrefix
  const drivePrefixMatch = source.match(/^([a-zA-Z]:)\//)

  let prefix = ''
  let rest = source
  let minLength = 0

  if (drivePrefixMatch) {
    prefix = `${drivePrefixMatch[1]}/`
    rest = source.slice(prefix.length)
  } else if (uncPrefix) {
    prefix = '//'
    rest = source.slice(2)
    minLength = 2
  } else if (absolutePrefix) {
    prefix = '/'
    rest = source.slice(1)
  }

  const normalizedParts: string[] = []
  for (const part of rest.split('/')) {
    if (!part || part === '.') {
      continue
    }

    if (part === '..') {
      const lastPart = normalizedParts.at(-1)
      if (normalizedParts.length > minLength && lastPart && lastPart !== '..') {
        normalizedParts.pop()
        continue
      }
      normalizedParts.push('..')
      continue
    }

    normalizedParts.push(part)
  }

  return prefix + normalizedParts.join('/')
}

export function assertNotEmpty(value: string, kind: string): void {
  if (!value) {
    throw new PathError(`${kind} 不得为空`)
  }
}

export function assertAbsolutePath(value: string): void {
  if (!/^([a-zA-Z]:\/|\/|\/\/[^/]+\/[^/]+)/.test(value)) {
    throw new PathError(`不是绝对路径: ${value}`)
  }
}

export function assertRelativePath(value: string): void {
  if (/^([a-zA-Z]:\/|\/|\/\/[^/]+\/[^/]+)/.test(value)) {
    throw new PathError(`不是相对路径: ${value}`)
  }
  if (value === '..' || value.startsWith('../')) {
    throw new PathError(`相对路径不能越界: ${value}`)
  }
}

export function assertSegment(value: string): void {
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
    throw new PathError(`非法路径片段: ${value}`)
  }
}

export function canonicalizeDriveLetter(value: string): string {
  return value.replace(/^([a-z]):/, (_, drive: string) => `${drive.toUpperCase()}:`)
}
