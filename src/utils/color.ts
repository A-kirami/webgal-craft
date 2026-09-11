import { clamp } from '~/utils/math'

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
  // 8 位 hex 携带 alpha 通道，这里只取 RGB 三通道
  if (hex.length !== 6 && hex.length !== 8) {
    return undefined
  }
  if (/[^a-fA-F\d]/.test(hex)) {
    return undefined
  }

  const red = Number.parseInt(hex.slice(0, 2), 16)
  const green = Number.parseInt(hex.slice(2, 4), 16)
  const blue = Number.parseInt(hex.slice(4, 6), 16)
  return [red, green, blue]
}

export function rgbToHex(red: number, green: number, blue: number): string {
  // 应用内颜色字符串统一为大写 hex
  const toHex = (channel: number) => normalizeColorChannel(channel, 0)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase()
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`
}
