import {
  cloneTransform,
  resolveTransformDraftDisplay,
} from '~/features/editor/transform-resolution/model'

import type { Transform } from '~/domain/stage/types'
import type { TransformBaselineSource } from '~/features/editor/transform-resolution/model'

export type TransformScaleAxis = 'x' | 'y'

interface FlipTransformScaleAxisOptions {
  axis: TransformScaleAxis
  baselineSource?: TransformBaselineSource
  baselineTransform?: Transform
  transform: Transform
}

function readScaleValue(transform: Transform, axis: TransformScaleAxis): number {
  const rawValue = transform.scale?.[axis]
  const value = Number(rawValue)

  return Number.isFinite(value) ? value : 1
}

export function flipTransformScaleAxis(options: FlipTransformScaleAxisOptions): Transform {
  const displayTransform = resolveTransformDraftDisplay({
    baselineSource: options.baselineSource,
    baselineTransform: options.baselineTransform,
    explicitDraftTransform: options.transform,
  }).displayTransform
  const nextTransform = cloneTransform(options.transform)

  nextTransform.scale = {
    ...nextTransform.scale,
    [options.axis]: -readScaleValue(displayTransform, options.axis),
  }

  return nextTransform
}
