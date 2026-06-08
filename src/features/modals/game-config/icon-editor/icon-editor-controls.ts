import { clamp, roundByStep } from '~/utils/math'

import type {
  IconEditorBackgroundType,
  IconEditorOffsetRatio,
  IconEditorShape,
} from './icon-editor-state'

const iconEditorBackgroundTypes = new Set<unknown>(['color', 'image'])
const iconEditorShapes = new Set<unknown>(['square', 'rounded', 'circle'])

export interface IconEditorTransformControl {
  id: string
  label: string
  max: number
  min: number
  step: number
  update: (value: IconEditorTransformControlValue, options?: IconEditorTransformUpdateOptions) => void
  value: number
}

export interface IconEditorTransformUpdateOptions {
  fromSlider?: boolean
}

interface TransformNumberOptions {
  center: number
  fallback: number
  max: number
  min: number
  snapToCenter?: boolean
  step: number
}

export type IconEditorTransformAxis = keyof IconEditorOffsetRatio
export type IconEditorTransformControlValue = number | number[] | string | undefined

export const SCALE_PERCENT_MAX = 175
export const SCALE_PERCENT_MIN = 25
export const SCALE_PERCENT_STEP = 1
export const SCALE_PERCENT_CENTER = 100
export const OFFSET_PERCENT_MAX = 75
export const OFFSET_PERCENT_MIN = -75
export const OFFSET_PERCENT_STEP = 1
export const OFFSET_PERCENT_CENTER = 0

const SLIDER_CENTER_SNAP_TOLERANCE = 0.02

export function createDefaultOffsetRatio(): IconEditorOffsetRatio {
  return { x: 0, y: 0 }
}

function parseTransformNumber(value: IconEditorTransformControlValue): number | undefined {
  if (Array.isArray(value)) {
    return value[0]
  }

  if (typeof value === 'number') {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? Number(trimmed) : undefined
  }
}

function applyTransformCenterSnap(value: number, center: number, min: number, max: number): number {
  const tolerance = (max - min) * SLIDER_CENTER_SNAP_TOLERANCE
  return Math.abs(value - center) <= tolerance ? center : value
}

export function normalizeTransformNumber(value: IconEditorTransformControlValue, options: TransformNumberOptions): number {
  const parsed = parseTransformNumber(value)
  if (parsed === undefined || !Number.isFinite(parsed)) {
    return options.fallback
  }

  const normalized = roundByStep(clamp(parsed, options.min, options.max), options.step)
  if (options.snapToCenter) {
    return applyTransformCenterSnap(normalized, options.center, options.min, options.max)
  }

  return normalized
}

export function scaleToPercent(value: number): number {
  return roundByStep(value * 100, SCALE_PERCENT_STEP)
}

export function percentToScale(value: number): number {
  return value / 100
}

export function ratioToPercent(value: number): number {
  return roundByStep(value * 100, OFFSET_PERCENT_STEP)
}

export function percentToRatio(value: number): number {
  return value / 100
}

function parseNumberLike(value: unknown): number {
  if (typeof value === 'number') {
    return value
  }

  if (typeof value === 'string') {
    return Number(value)
  }

  return Number.NaN
}

function normalizeColorChannelValue(value: unknown, fallback: number): number {
  const parsed = parseNumberLike(value)
  return Number.isFinite(parsed) ? clamp(Math.round(parsed), 0, 255) : fallback
}

function normalizeAlphaValue(value: unknown): number {
  const parsed = parseNumberLike(value)
  return Number.isFinite(parsed) ? clamp(parsed, 0, 1) : 1
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

function formatCssColorFromRecord(value: Record<string, unknown>): string | undefined {
  if (!('r' in value) || !('g' in value) || !('b' in value)) {
    return
  }

  const red = normalizeColorChannelValue(value.r, 0)
  const green = normalizeColorChannelValue(value.g, 0)
  const blue = normalizeColorChannelValue(value.b, 0)
  if ('a' in value) {
    return `rgba(${red}, ${green}, ${blue}, ${normalizeAlphaValue(value.a)})`
  }

  return `rgb(${red}, ${green}, ${blue})`
}

export function resolveBackgroundColor(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value
  }

  if (!isRecord(value)) {
    return
  }

  return formatCssColorFromRecord(isRecord(value.rgba) ? value.rgba : value)
    ?? (typeof value.hex8 === 'string' ? value.hex8 : undefined)
    ?? (typeof value.hex === 'string' ? value.hex : undefined)
}

export function isIconEditorBackgroundType(value: unknown): value is IconEditorBackgroundType {
  return iconEditorBackgroundTypes.has(value)
}

export function isIconEditorShape(value: unknown): value is IconEditorShape {
  return iconEditorShapes.has(value)
}
