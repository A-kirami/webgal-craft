export const GAME_CONFIG_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp']

export function parseStartupImages(value: string): string[] {
  return value
    .split('|')
    .map(item => item.trim())
    .filter(Boolean)
}

export function serializeStartupImages(images: string[]): string {
  if (images.length === 0) {
    return ''
  }

  return `${images.join('|')}|`
}
