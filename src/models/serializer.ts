import { serializeAnimationFrames } from './animation-document-codec'
import { normalizeTextLineEnding } from './document-model'

import type { DocumentModel } from './document-model'

// ============================================================
// 序列化：DocumentModel → 文件内容字符串
// ============================================================

/**
 * 将 DocumentModel 序列化为可保存的文件内容字符串。
 *
 * 场景文件：将 SceneStatement[] 通过 rawText 拼接。
 * 动画文件：将 AnimationFrame[] 序列化为格式化 JSON。
 * 模板/纯文本：直接返回 content。
 *
 * 所有类型都会根据 metadata.lineEnding 还原行尾符。
 */
export function serializeDocument(model: DocumentModel): string {
  let result: string

  switch (model.kind) {
    case 'scene': {
      result = joinStatements(model.statements)
      break
    }
    case 'animation': {
      result = serializeAnimationFrames(model.frames)
      break
    }
    case 'template':
    case 'plaintext': {
      result = model.content
      break
    }
    default: {
      throw new Error(`未知的文档类型: ${(model as { kind: string }).kind}`)
    }
  }

  return normalizeTextLineEnding(result, model.metadata.lineEnding)
}
