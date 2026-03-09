export function clamp(value: number, min?: number, max?: number): number {
  if (min !== undefined && value < min) {
    return min
  }
  if (max !== undefined && value > max) {
    return max
  }
  return value
}

// 从步进值推导小数精度位数，用于 roundByStep 的 toFixed 参数。
// 处理科学计数法（如 0.001 → "1e-3" → 精度 3）和普通小数（如 0.01 → 精度 2）
export function normalizeStepPrecision(step: number): number {
  const stepText = String(step)
  if (stepText.includes('e-')) {
    const exponent = Number(stepText.split('e-')[1])
    return Number.isFinite(exponent) ? exponent : 0
  }
  const dotIndex = stepText.indexOf('.')
  return dotIndex === -1 ? 0 : stepText.length - dotIndex - 1
}

export function roundByStep(value: number, step: number): number {
  const precision = normalizeStepPrecision(step)
  return Number(value.toFixed(precision))
}

export function radianToDegree(radian: number): number {
  return radian * (180 / Math.PI)
}

export function degreeToRadian(degree: number): number {
  return degree * (Math.PI / 180)
}

export function roundToPrecision(value: number, precision: number): number {
  return Number(value.toFixed(precision))
}

// 将角度差值归一化到 (-180, 180] 区间，
// 用于旋转拖拽时计算最短路径方向的增量
export function normalizeAngleDelta(delta: number): number {
  let normalized = delta % 360
  if (normalized > 180) {
    normalized -= 360
  }
  if (normalized < -180) {
    normalized += 360
  }
  return normalized
}

export function normalizeDegree(degree: number): number {
  const normalized = degree % 360
  return normalized < 0 ? normalized + 360 : normalized
}

export function getPointerAngleDegrees(event: PointerEvent, centerX: number, centerY: number): number {
  return radianToDegree(Math.atan2(event.clientY - centerY, event.clientX - centerX))
}

export function applyScrubStepModifier(
  baseStep: number,
  event: { altKey: boolean, shiftKey: boolean },
  options?: { altFactor?: number, shiftFactor?: number },
): number {
  if (event.altKey) {
    return baseStep * (options?.altFactor ?? 0.1)
  }
  if (event.shiftKey) {
    return baseStep * (options?.shiftFactor ?? 10)
  }
  return baseStep
}
