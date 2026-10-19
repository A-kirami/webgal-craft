import { AnimationFrame } from '~/domain/stage/types'

export type AnimationDocumentFormat = 'v1-frames' | 'v2-object'

function parseAnimationDocumentJson(content: string): unknown {
  const normalizedContent = content.trim() === '' ? '[]' : content
  return JSON.parse(normalizedContent)
}

/**
 * 按顶层结构识别动画文档格式。
 * 关键帧数组是 v1 接口；对象是 v2 文档，缺省 version 视为 2，version: 1 的包装对象同样是合法文档。
 */
export function detectAnimationDocumentFormat(content: string): AnimationDocumentFormat {
  const parsed = parseAnimationDocumentJson(content)
  if (Array.isArray(parsed)) {
    return 'v1-frames'
  }

  if (typeof parsed === 'object' && parsed !== null) {
    return 'v2-object'
  }

  throw new TypeError('动画文档必须是关键帧数组或动画对象')
}

/** 解析 v1 关键帧数组；v2 对象没有可帧编辑的模型，调用方需先用 detectAnimationDocumentFormat 分支 */
export function parseAnimationDocument(content: string): AnimationFrame[] {
  const parsed = parseAnimationDocumentJson(content)
  if (!Array.isArray(parsed)) {
    throw new TypeError('动画文档必须是 JSON 数组')
  }
  return parsed as AnimationFrame[]
}

export function isAnimationDocumentTextValid(content: string): boolean {
  try {
    detectAnimationDocumentFormat(content)
    return true
  } catch {
    return false
  }
}

export function serializeAnimationFrames(frames: readonly AnimationFrame[]): string {
  // eslint-disable-next-line unicorn/no-null -- JSON.stringify 的 replacer 参数标准用法
  return JSON.stringify(frames, null, 2)
}
