import { degreeToRadian, radianToDegree, roundByStep, roundToPrecision } from '~/utils/math'

const EFFECT_ROTATION_DEGREE_STEP = 0.01
const EFFECT_ROTATION_RADIAN_PRECISION = 4

export function formatEffectRotationDegree(degree: number): number {
  return roundByStep(degree, EFFECT_ROTATION_DEGREE_STEP)
}

export function effectRotationDegreeToStoredRadian(degree: number): number {
  return roundToPrecision(degreeToRadian(formatEffectRotationDegree(degree)), EFFECT_ROTATION_RADIAN_PRECISION)
}

export function normalizeEffectRotationRadian(radian: number): number {
  return effectRotationDegreeToStoredRadian(radianToDegree(radian))
}
