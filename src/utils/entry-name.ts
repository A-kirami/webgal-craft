export function buildUniqueEntryName(
  baseName: string,
  isDir: boolean,
  existingNames: ReadonlySet<string>,
): string {
  let counter = 1
  let nextName = baseName
  const lastDotIndex = baseName.lastIndexOf('.')
  const hasExt = !isDir && lastDotIndex > 0
  const ext = hasExt ? baseName.slice(lastDotIndex) : ''
  const nameWithoutExt = hasExt ? baseName.slice(0, lastDotIndex) : baseName

  while (existingNames.has(nextName)) {
    nextName = `${nameWithoutExt} (${counter})${ext}`
    counter += 1
  }

  return nextName
}
