import { AnimationFrame } from '~/domain/stage/types'

export function parseAnimationDocument(content: string): AnimationFrame[] {
  const normalizedContent = content.trim() === '' ? '[]' : content
  const parsed = JSON.parse(normalizedContent)
  if (!Array.isArray(parsed)) {
    throw new TypeError('动画文档必须是 JSON 数组')
  }
  return parsed as AnimationFrame[]
}

export function isAnimationDocumentTextValid(content: string): boolean {
  try {
    parseAnimationDocument(content)
    return true
  } catch {
    return false
  }
}

export function serializeAnimationFrames(frames: readonly AnimationFrame[]): string {
  // eslint-disable-next-line unicorn/no-null -- JSON.stringify 的 replacer 参数标准用法
  return JSON.stringify(frames, null, 2)
}
