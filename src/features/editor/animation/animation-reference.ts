import { AbsPath, RelPath } from '~/domain/path'
import { hasVariableInterpolation } from '~/domain/script/variable-interpolation'
import { gameAssetDir } from '~/services/platform/app-paths'

export const ANIMATION_FILE_SUFFIX = '.json'
export const ANIMATION_TABLE_STEM = 'animationTable'

export type AnimationReferenceError = 'dynamic-name' | 'empty' | 'invalid-path' | 'reserved-name'

export interface AnimationReference {
  /** `game/animation` 下的相对路径（不含扩展名），同时是 setAnimation 的动画名 */
  animationName: string
  filePath: AbsPath
}

export type AnimationReferenceResolution =
  | { ok: true, reference: AnimationReference }
  | { ok: false, error: AnimationReferenceError }

function isAbsoluteInput(input: string): boolean {
  return /^([a-zA-Z]:|[/\\])/.test(input)
}

function hasInvalidSegments(input: string): boolean {
  return input.split('/').some(segment => ['', '.', '..'].includes(segment.trim()))
}

/**
 * 把 setAnimation 的动画名解析为动画文件路径。
 *
 * 与写入侧的 resolveAnimationFileTarget 不同，这里不做文件名清洗：读取必须保持名字与文件的一一对应，
 * 非法名字应显式报错，而不是悄悄指向另一个文件。
 */
export function resolveAnimationReference(
  gamePath: AbsPath,
  rawName: string,
): AnimationReferenceResolution {
  const name = rawName.trim()
  if (name === '') {
    return { error: 'empty', ok: false }
  }

  if (hasVariableInterpolation(name)) {
    return { error: 'dynamic-name', ok: false }
  }

  // 反斜杠在 Windows 上同样是分隔符，按文件路径身份一律拒绝
  if (isAbsoluteInput(name) || name.includes('\\') || hasInvalidSegments(name)) {
    return { error: 'invalid-path', ok: false }
  }

  const animationName = name.toLowerCase().endsWith(ANIMATION_FILE_SUFFIX)
    ? name.slice(0, -ANIMATION_FILE_SUFFIX.length)
    : name
  if (animationName === '') {
    return { error: 'empty', ok: false }
  }

  if (animationName.toLowerCase() === ANIMATION_TABLE_STEM.toLowerCase()) {
    return { error: 'reserved-name', ok: false }
  }

  return {
    ok: true,
    reference: {
      animationName,
      filePath: AbsPath.join(
        gameAssetDir(gamePath, 'animation'),
        RelPath.from(`${animationName}${ANIMATION_FILE_SUFFIX}`),
      ),
    },
  }
}

/** 从 `game/animation` 下的文件路径反推动画名，用于重命名后继续计算引用计数与显示路径 */
export function resolveAnimationNameFromPath(
  gamePath: AbsPath,
  path: AbsPath,
): string | undefined {
  const animationRootPath = gameAssetDir(gamePath, 'animation')
  if (!path.startsWith(`${animationRootPath}/`)) {
    return
  }

  const relativePath = AbsPath.relativize(path, animationRootPath)
  if (!relativePath.toLowerCase().endsWith(ANIMATION_FILE_SUFFIX)) {
    return
  }

  const animationName = relativePath.slice(0, -ANIMATION_FILE_SUFFIX.length)
  if (animationName === '' || animationName.toLowerCase() === ANIMATION_TABLE_STEM.toLowerCase()) {
    return
  }

  return animationName
}
