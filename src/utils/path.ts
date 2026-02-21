export function toComparablePath(path: string): string {
  return path
    .replaceAll('\\', '/')
    .replace(/\/+$/, '')
    .toLocaleLowerCase()
}

export function normalizeRelativePath(path: string): string {
  return path
    .replaceAll('\\', '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}
