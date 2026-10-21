import sanitize from 'sanitize-filename'

import { serializeAnimationFrames } from '~/domain/document/animation-document-codec'
import { encodeTextFile } from '~/domain/document/file-codec'
import { AbsPath, RelPath } from '~/domain/path'
import { syncAnimationTable } from '~/services/animation-table-sync'
import { gameFs } from '~/services/game-fs'
import { gameAssetDir } from '~/services/platform/app-paths'

import { ANIMATION_FILE_SUFFIX, ANIMATION_TABLE_STEM } from './animation-reference'

import type { TextMetadata } from '~/domain/document/document-model'
import type { AnimationFrame } from '~/domain/stage/types'

const ILLEGAL_FILENAME_REPLACEMENT = '_'

export type AnimationFileTargetError = 'empty' | 'invalid-path' | 'reserved-name'

export interface AnimationFileTarget {
  /** `game/animation` 下的相对路径（不含扩展名），同时是 setAnimation 的动画名 */
  animationName: string
  filePath: AbsPath
}

export type AnimationFileTargetResolution =
  | { ok: true, target: AnimationFileTarget }
  | { ok: false, error: AnimationFileTargetError }

function isAbsoluteInput(input: string): boolean {
  return /^([a-zA-Z]:|[/\\])/.test(input)
}

function hasTraversalSegment(input: string): boolean {
  // 反斜杠同样按分隔符看待：用户输入带 .. 的反斜杠路径时同样要拒绝
  return input.split(/[\\/]/).some((segment) => {
    const trimmed = segment.trim()
    return trimmed === '.' || trimmed === '..'
  })
}

export function resolveAnimationFileTarget(
  gamePath: AbsPath,
  rawInput: string,
): AnimationFileTargetResolution {
  const input = rawInput.trim()
  if (input === '') {
    return { error: 'empty', ok: false }
  }

  // 绝对路径与越界段必须在 sanitize 之前判断：sanitize 会把分隔符替换成普通字符，
  // 之后再检查就分不清用户输入的是路径还是普通名称。
  if (isAbsoluteInput(input)) {
    return { error: 'invalid-path', ok: false }
  }

  if (hasTraversalSegment(input)) {
    return { error: 'invalid-path', ok: false }
  }

  const segments = input
    .split('/')
    .map(segment => segment.trim())
    .filter(segment => segment !== '')
    .map(segment => sanitize(segment, { replacement: ILLEGAL_FILENAME_REPLACEMENT }))

  const fileName = segments.at(-1)
  if (!fileName) {
    return { error: 'empty', ok: false }
  }

  const stem = fileName.toLowerCase().endsWith(ANIMATION_FILE_SUFFIX)
    ? fileName.slice(0, -ANIMATION_FILE_SUFFIX.length)
    : fileName
  if (stem === '') {
    return { error: 'empty', ok: false }
  }

  const animationName = [...segments.slice(0, -1), stem].join('/')
  if (animationName.toLowerCase() === ANIMATION_TABLE_STEM.toLowerCase()) {
    return { error: 'reserved-name', ok: false }
  }

  const animationRootPath = gameAssetDir(gamePath, 'animation')
  const filePath = AbsPath.join(
    animationRootPath,
    RelPath.from(`${animationName}${ANIMATION_FILE_SUFFIX}`),
  )

  return {
    ok: true,
    target: { animationName, filePath },
  }
}

/**
 * 写入动画文档并补一次 animationTable 同步。
 * 文件事件链路也会触发同步，但 watcher 在部分平台/时序下可能晚到，这里显式保证新条目立即可用。
 */
export async function saveAnimationFile(
  gamePath: AbsPath,
  target: AnimationFileTarget,
  frames: readonly AnimationFrame[],
  metadata?: TextMetadata,
): Promise<void> {
  const content = serializeAnimationFrames(frames)
  await (metadata
    ? gameFs.writeDocumentFile(target.filePath, encodeTextFile(content, metadata))
    : gameFs.writeFile(target.filePath, content))

  try {
    await syncAnimationTable(gamePath)
  } catch (error) {
    // 文件已经写入成功，动画表同步失败不应让用户重试并撞上「同名文件已存在」
    logger.warn(`同步 animationTable.json 失败: ${String(error)}`)
  }
}
