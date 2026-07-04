import {
  getValueByPath,
  setValueByPath,
  unsetValueByPath,
} from '~/features/editor/effect-editor/effect-editor-config'
import { normalizeEffectRotationRadian } from '~/features/editor/effect-editor/transform-rotation-format'
import {
  cloneTransform,
  resolveTransformDraftDisplay,
} from '~/features/editor/transform-resolution/model'

import type { Transform } from '~/domain/stage/types'
import type { TransformBaselineSource } from '~/features/editor/transform-resolution/model'

export interface DisplayTransform {
  position: {
    x: number
    y: number
  }
  scale: {
    x: number
    y: number
  }
  rotation: number
}

interface DeriveDisplayTransformOptions {
  baselineSource?: TransformBaselineSource
  baselineTransform?: Transform
  explicitDraftTransform: Transform
}

interface MaterializeDisplayTransformOptions {
  currentDisplayTransform: DisplayTransform
  explicitDraftTransform: Transform
  nextDisplayTransform: DisplayTransform
}

type DisplayTransformFieldPath = 'position.x' | 'position.y' | 'scale.x' | 'scale.y' | 'rotation'

const DISPLAY_TRANSFORM_FIELD_PATHS: DisplayTransformFieldPath[] = [
  'position.x',
  'position.y',
  'scale.x',
  'scale.y',
  'rotation',
]

export const BASE_DISPLAY_TRANSFORM: DisplayTransform = {
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
}

function isEmptyTransformFieldValue(value: unknown): boolean {
  return value === undefined || value === ''
}

function readNumberByPath(source: Transform | undefined, path: string): number | undefined {
  const raw = getValueByPath((source ?? {}) as unknown as Record<string, unknown>, path)
  if (isEmptyTransformFieldValue(raw)) {
    return undefined
  }

  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

function writeNumberByPath(target: Transform, path: string, value: number | undefined): void {
  if (value === undefined || !Number.isFinite(value)) {
    unsetValueByPath(target as unknown as Record<string, unknown>, path)
    return
  }

  setValueByPath(
    target as unknown as Record<string, unknown>,
    path,
    path === 'rotation' ? normalizeEffectRotationRadian(value) : value,
  )
}

function displayTransformToTransform(displayTransform: Partial<DisplayTransform>): Transform {
  const transform: Transform = {}

  writeNumberByPath(transform, 'position.x', displayTransform.position?.x)
  writeNumberByPath(transform, 'position.y', displayTransform.position?.y)
  writeNumberByPath(transform, 'scale.x', displayTransform.scale?.x)
  writeNumberByPath(transform, 'scale.y', displayTransform.scale?.y)
  writeNumberByPath(transform, 'rotation', displayTransform.rotation)

  return transform
}

function readDisplayTransform(source: Transform | undefined, fallback: DisplayTransform): DisplayTransform {
  return {
    position: {
      x: readNumberByPath(source, 'position.x') ?? fallback.position.x,
      y: readNumberByPath(source, 'position.y') ?? fallback.position.y,
    },
    scale: {
      x: readNumberByPath(source, 'scale.x') ?? fallback.scale.x,
      y: readNumberByPath(source, 'scale.y') ?? fallback.scale.y,
    },
    rotation: readNumberByPath(source, 'rotation') ?? fallback.rotation,
  }
}

function readDisplayTransformValue(
  displayTransform: DisplayTransform,
  path: DisplayTransformFieldPath,
): number {
  switch (path) {
    case 'position.x': {
      return displayTransform.position.x
    }
    case 'position.y': {
      return displayTransform.position.y
    }
    case 'scale.x': {
      return displayTransform.scale.x
    }
    case 'scale.y': {
      return displayTransform.scale.y
    }
    case 'rotation': {
      return displayTransform.rotation
    }
    default: {
      const neverPath: never = path
      return neverPath
    }
  }
}

export function deriveDisplayTransform(options: DeriveDisplayTransformOptions): DisplayTransform {
  const resolved = resolveTransformDraftDisplay({
    baselineSource: options.baselineSource,
    baselineTransform: options.baselineTransform,
    editorDefaultTransform: displayTransformToTransform(BASE_DISPLAY_TRANSFORM),
    explicitDraftTransform: options.explicitDraftTransform,
  })

  return readDisplayTransform(resolved.displayTransform, BASE_DISPLAY_TRANSFORM)
}

export function materializeDisplayTransform(options: MaterializeDisplayTransformOptions): Transform {
  const nextDraft = cloneTransform(options.explicitDraftTransform)

  for (const path of DISPLAY_TRANSFORM_FIELD_PATHS) {
    const currentValue = readDisplayTransformValue(options.currentDisplayTransform, path)
    const nextValue = readDisplayTransformValue(options.nextDisplayTransform, path)
    if (currentValue === nextValue) {
      continue
    }

    writeNumberByPath(nextDraft, path, nextValue)
  }

  return nextDraft
}
