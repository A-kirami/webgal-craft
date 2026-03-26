import { clamp } from '~/utils/math'

export interface RgbColor {
  r: number
  g: number
  b: number
}

export interface RgbaPayload {
  rgba: RgbColor
}

export function normalizeColorChannel(raw: number, fallback: number): number {
  return Number.isFinite(raw) ? clamp(Math.round(raw), 0, 255) : fallback
}

export function parseHexColor(value: string): [number, number, number] | undefined {
  const normalized = value.trim().replace('#', '')
  if (!normalized) {
    return undefined
  }

  let hex = normalized
  if (hex.length === 3) {
    hex = [...hex].map(char => `${char}${char}`).join('')
  }
  if (hex.length !== 6 || /[^a-fA-F\d]/.test(hex)) {
    return undefined
  }

  const red = Number.parseInt(hex.slice(0, 2), 16)
  const green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16)
  return [red, green, blue]
}

export function isRgbColor(value: unknown): value is RgbColor {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return typeof record.r === 'number' && typeof record.g === 'number' && typeof record.b === 'number'
}

export function isRgbaPayload(value: unknown): value is RgbaPayload {
  if (!value || typeof value !== 'object') {
    return false
  }
  return isRgbColor((value as Record<string, unknown>).rgba)
}

export function extractRgbColor(rawValue: unknown): [number, number, number] | undefined {
  if (typeof rawValue === 'string') {
    return parseHexColor(rawValue)
  }

  if (isRgbaPayload(rawValue)) {
    return [
      normalizeColorChannel(rawValue.rgba.r, 0),
      normalizeColorChannel(rawValue.rgba.g, 0),
      normalizeColorChannel(rawValue.rgba.b, 0),
    ]
  }

  if (isRgbColor(rawValue)) {
    return [
      normalizeColorChannel(rawValue.r, 0),
      normalizeColorChannel(rawValue.g, 0),
      normalizeColorChannel(rawValue.b, 0),
    ]
  }
}
