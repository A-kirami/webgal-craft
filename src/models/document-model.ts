import { buildSceneStatements } from '~/helper/webgal-script/sentence'
import { AnimationFrame } from '~/types/stage'

import { parseAnimationDocument } from './animation-document-codec'

// ============================================================
// 元数据
// ============================================================

export interface TextMetadata {
  /** 原始行尾符，序列化时还原 */
  lineEnding: '\n' | '\r\n'
  /** UTF-8 写盘策略；仅区分是否保留 UTF-8 BOM */
  // eslint-disable-next-line unicorn/text-encoding-identifier-case -- 持久化元数据沿用文件编码标识
  encoding: 'utf-8' | 'utf-8-bom'
}

// ============================================================
// 文档模型（按 kind 判别的 discriminated union）
// ============================================================

/** 场景文档：结构化模型，支持可视化编辑（语句卡片 + 参数表单） */
export interface SceneStatement {
  id: number
  rawText: string
}

/** 场景文档：结构化模型，支持可视化编辑（语句卡片 + 参数表单） */
export interface SceneDocumentModel {
  kind: 'scene'
  statements: SceneStatement[]
  metadata: TextMetadata
}

/** 动画文档：结构化模型，支持可视化编辑（动画编辑器） */
export interface AnimationDocumentModel {
  kind: 'animation'
  frames: AnimationFrame[]
  metadata: TextMetadata
}

/** 模板文档：纯文本模型，不支持可视化编辑 */
export interface TemplateDocumentModel {
  kind: 'template'
  content: string
  metadata: TextMetadata
}

/** 普通文本文档：纯文本模型，不支持可视化编辑 */
export interface PlainTextDocumentModel {
  kind: 'plaintext'
  content: string
  metadata: TextMetadata
}

export type DocumentModel =
  | SceneDocumentModel
  | AnimationDocumentModel
  | TemplateDocumentModel
  | PlainTextDocumentModel

/** 文档 kind 字面量联合 */
export type DocumentKind = DocumentModel['kind']

function detectTextLineEnding(text: string): TextMetadata['lineEnding'] {
  return text.includes('\r\n') ? '\r\n' : '\n'
}

export function normalizeTextLineEnding(
  text: string,
  lineEnding: TextMetadata['lineEnding'],
): string {
  if (lineEnding === '\r\n') {
    // 先统一为 \n，再替换为 \r\n，避免重复替换
    return text.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n')
  }

  return text.replaceAll('\r\n', '\n')
}

export function createTextMetadata(
  content: string,
  metadata: Partial<TextMetadata> | undefined = undefined,
): TextMetadata {
  return {
    lineEnding: metadata?.lineEnding ?? detectTextLineEnding(content),
    // eslint-disable-next-line unicorn/text-encoding-identifier-case -- 持久化元数据沿用文件编码标识
    encoding: metadata?.encoding ?? 'utf-8',
  }
}

/**
 * 根据 kind 和文件内容创建对应的 DocumentModel。
 * 场景和动画文档会在这里完成结构化解析；
 * 模板和纯文本则保持原始文本内容。
 */
export function createDocumentModel(options: {
  kind: DocumentKind
  content: string
  metadata?: Partial<TextMetadata>
}): DocumentModel {
  const { kind, content } = options
  const metadata = createTextMetadata(content, options.metadata)

  switch (kind) {
    case 'scene': {
      const statements = buildSceneStatements(content)
      return {
        kind: 'scene',
        statements: statements.map(statement => ({
          id: statement.id,
          rawText: statement.rawText,
        })),
        metadata,
      }
    }
    case 'animation': {
      return {
        kind: 'animation',
        frames: parseAnimationDocument(content),
        metadata,
      }
    }
    case 'template': {
      return { kind: 'template', content, metadata }
    }
    case 'plaintext': {
      return { kind: 'plaintext', content, metadata }
    }
    default: {
      throw new Error(`未知的文档类型: ${kind satisfies never}`)
    }
  }
}
