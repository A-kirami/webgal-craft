import { join } from '@tauri-apps/api/path'
import { readTextFile } from '@tauri-apps/plugin-fs'

import { gameAssetDir } from '~/helper/app-paths'
import { DynamicOptionsContext, DynamicOptionSourceDef } from '~/helper/command-registry/schema'

interface FigureMetadata {
  motions: string[]
  expressions: string[]
}

const SPLIT_GAME_PATH_TOKEN = '|'
const ANIMATION_TABLE_SUFFIX = /[/\\]game[/\\]animation[/\\]animationTable\.json$/i

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/')
}

export function normalizeGamePath(path: string): string {
  return normalizePath(path).replace(/\/+$/, '').toLowerCase()
}

function normalizeOptionValue(value: string): string | undefined {
  return value.trim() || undefined
}

function toOptionItems(items: string[]): { label: string, value: string }[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of items) {
    const normalized = normalizeOptionValue(item)
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized)
      result.push(normalized)
    }
  }
  return result
    .toSorted((a, b) => a.localeCompare(b))
    .map(value => ({ label: value, value }))
}

// 清洗 changeFigure 的 content 字段，提取并验证模型文件的相对路径。
// 剥离查询参数（如 ?type=spine），校验路径安全性和 .json 后缀。
// 仅接受 .json 描述文件（Live2D model.json / Spine JSON），
// .skel（Spine 二进制骨骼）无法通过 JSON 解析提取元数据，因此不在此处理——
// 对应的 motion/expression 字段仍会显示（由 media.ts 的 isAnimatedContent 控制），
// 用于展示文本模式下已写入的参数值，但不提供动态选项的自动补全。
function sanitizeModelPath(content: string): string | undefined {
  const normalized = normalizePath(content.split('?')[0]?.trim() ?? '')
  if (!normalized) {
    return
  }

  const segments = normalized.replace(/^\/+/, '').split('/').filter(Boolean)
  if (segments.length === 0 || segments.includes('..')) {
    return
  }

  const relativePath = segments.join('/')
  if (!relativePath.toLowerCase().endsWith('.json')) {
    return
  }
  return relativePath
}

interface FigureModelPath {
  gameKey: string
  relativePath: string
}

function resolveFigureModelPath(ctx: DynamicOptionsContext): FigureModelPath | undefined {
  const gameKey = normalizeGamePath(ctx.gamePath)
  if (!gameKey) {
    return
  }
  const relativePath = sanitizeModelPath(ctx.content)
  if (!relativePath) {
    return
  }
  return { gameKey, relativePath }
}

function buildFigureCacheKey(ctx: DynamicOptionsContext): string | undefined {
  const resolved = resolveFigureModelPath(ctx)
  if (!resolved) {
    return
  }
  return `${resolved.gameKey}${SPLIT_GAME_PATH_TOKEN}${resolved.relativePath.toLowerCase()}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// animationTable.json 的格式为字符串数组 ["anim1", "anim2"]
function parseAnimationTableEntries(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw.filter((item): item is string => typeof item === 'string')
}

// Live2D / Spine 模型描述文件的 motions 和 expressions 字段格式不统一：
// - Live2D v2: { motions: { idle: [...] }, expressions: [{ name: "smile" }] }
// - Live2D v3+: { FileReferences: { Motions: {...}, Expressions: [...] } }
// - 简化格式: { animations: { walk: {...} } }
// 此函数兼容以上格式，提取所有可用的动作和表情名称
function parseFigureMetadata(raw: unknown): FigureMetadata {
  if (!isRecord(raw)) {
    return { motions: [], expressions: [] }
  }

  const motions: string[] = []
  const expressions: string[] = []

  if (isRecord(raw.animations)) {
    motions.push(...Object.keys(raw.animations))
    return { motions, expressions }
  }

  if (isRecord(raw.motions)) {
    motions.push(...Object.keys(raw.motions))
  }
  if (Array.isArray(raw.expressions)) {
    for (const expression of raw.expressions) {
      if (isRecord(expression) && typeof expression.name === 'string') {
        expressions.push(expression.name)
      }
    }
  }

  if (isRecord(raw.FileReferences)) {
    const fileReferences = raw.FileReferences
    if (isRecord(fileReferences.Motions)) {
      motions.push(...Object.keys(fileReferences.Motions))
    }
    if (Array.isArray(fileReferences.Expressions)) {
      for (const expression of fileReferences.Expressions) {
        if (isRecord(expression) && typeof expression.Name === 'string') {
          expressions.push(expression.Name)
        }
      }
    }
  }

  return {
    motions,
    expressions,
  }
}

async function loadAnimationTableOptions(ctx: DynamicOptionsContext): Promise<{ label: string, value: string }[]> {
  if (!ctx.gamePath) {
    return []
  }

  try {
    const directory = await gameAssetDir(ctx.gamePath, 'animation')
    const filePath = await join(directory, 'animationTable.json')
    const content = await readTextFile(filePath)
    return toOptionItems(parseAnimationTableEntries(JSON.parse(content)))
  } catch (error) {
    logger.error(`读取 animationTable.json 失败: ${error}`)
    return []
  }
}

async function loadFigureMetadataByContext(ctx: DynamicOptionsContext): Promise<FigureMetadata> {
  const resolved = resolveFigureModelPath(ctx)
  if (!resolved) {
    return { motions: [], expressions: [] }
  }

  try {
    const directory = await gameAssetDir(ctx.gamePath, 'figure')
    const filePath = await join(directory, resolved.relativePath)
    const content = await readTextFile(filePath)
    return parseFigureMetadata(JSON.parse(content))
  } catch (error) {
    logger.error(`解析立绘模型失败 ${ctx.content}: ${error}`)
    return { motions: [], expressions: [] }
  }
}

function createFigureSource(
  key: 'figureMotions' | 'figureExpressions',
  pick: (metadata: FigureMetadata) => string[],
): DynamicOptionSourceDef {
  return {
    key,
    resolveCacheKey(ctx) {
      return buildFigureCacheKey(ctx)
    },
    async loadOptions(ctx) {
      return toOptionItems(pick(await loadFigureMetadataByContext(ctx)))
    },
  }
}

export const editorDynamicOptionSources: DynamicOptionSourceDef[] = [
  {
    key: 'animationTableEntries',
    resolveCacheKey(ctx) {
      return normalizeGamePath(ctx.gamePath) || undefined
    },
    loadOptions: loadAnimationTableOptions,
    invalidateByFileModified(path) {
      return ANIMATION_TABLE_SUFFIX.test(normalizePath(path))
    },
  },
  createFigureSource('figureMotions', metadata => metadata.motions),
  createFigureSource('figureExpressions', metadata => metadata.expressions),
]
