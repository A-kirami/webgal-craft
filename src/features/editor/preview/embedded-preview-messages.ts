export const WEBGAL_PREVIEW_BOOTSTRAP_REQUEST = 'webgal.preview.bootstrap.request' as const
export const WEBGAL_PREVIEW_BOOTSTRAP_PROVIDE = 'webgal.preview.bootstrap.provide' as const
export const WEBGAL_PREVIEW_VIEWPORT_POINTER = 'webgal.preview.viewport.pointer' as const
export const WEBGAL_PREVIEW_VIEWPORT_SPACE_KEY = 'webgal.preview.viewport.space-key' as const
export const WEBGAL_PREVIEW_VIEWPORT_WHEEL = 'webgal.preview.viewport.wheel' as const
export const WEBGAL_PREVIEW_OUTPUT_SETTINGS = 'webgal.preview.output-settings' as const

export type PreviewViewportPointerEventType = 'pointercancel' | 'pointerdown' | 'pointermove' | 'pointerup'

export interface PreviewBootstrapRequestMessage {
  type: typeof WEBGAL_PREVIEW_BOOTSTRAP_REQUEST
}

export interface PreviewBootstrapProvideMessage {
  type: typeof WEBGAL_PREVIEW_BOOTSTRAP_PROVIDE
  embeddedLaunchId: string
}

export interface PreviewViewportSpaceKeyMessage {
  type: typeof WEBGAL_PREVIEW_VIEWPORT_SPACE_KEY
  pressed: boolean
}

export interface PreviewViewportPointerMessage {
  type: typeof WEBGAL_PREVIEW_VIEWPORT_POINTER
  button: number
  buttons: number
  clientX: number
  clientY: number
  eventType: PreviewViewportPointerEventType
  pointerId: number
}

export interface PreviewViewportWheelMessage {
  type: typeof WEBGAL_PREVIEW_VIEWPORT_WHEEL
  clientX: number
  clientY: number
  ctrlKey: boolean
  deltaY: number
  metaKey: boolean
}

export interface PreviewOutputSettingsMessage {
  type: typeof WEBGAL_PREVIEW_OUTPUT_SETTINGS
  muted: boolean
  volume: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isPreviewViewportPointerEventType(value: unknown): value is PreviewViewportPointerEventType {
  return ['pointercancel', 'pointerdown', 'pointermove', 'pointerup'].includes(value as PreviewViewportPointerEventType)
}

export function isPreviewBootstrapRequestMessage(value: unknown): value is PreviewBootstrapRequestMessage {
  return isRecord(value)
    && value.type === WEBGAL_PREVIEW_BOOTSTRAP_REQUEST
}

export function isPreviewViewportPointerMessage(value: unknown): value is PreviewViewportPointerMessage {
  return isRecord(value)
    && value.type === WEBGAL_PREVIEW_VIEWPORT_POINTER
    && isPreviewViewportPointerEventType(value.eventType)
    && isFiniteNumber(value.button)
    && isFiniteNumber(value.buttons)
    && isFiniteNumber(value.clientX)
    && isFiniteNumber(value.clientY)
    && isFiniteNumber(value.pointerId)
}

export function isPreviewViewportSpaceKeyMessage(value: unknown): value is PreviewViewportSpaceKeyMessage {
  return isRecord(value)
    && value.type === WEBGAL_PREVIEW_VIEWPORT_SPACE_KEY
    && typeof value.pressed === 'boolean'
}

export function isPreviewViewportWheelMessage(value: unknown): value is PreviewViewportWheelMessage {
  return isRecord(value)
    && value.type === WEBGAL_PREVIEW_VIEWPORT_WHEEL
    && isFiniteNumber(value.clientX)
    && isFiniteNumber(value.clientY)
    && typeof value.ctrlKey === 'boolean'
    && isFiniteNumber(value.deltaY)
    && typeof value.metaKey === 'boolean'
}

export function createPreviewBootstrapProvideMessage(
  embeddedLaunchId: string,
): PreviewBootstrapProvideMessage {
  return {
    type: WEBGAL_PREVIEW_BOOTSTRAP_PROVIDE,
    embeddedLaunchId,
  }
}

export function createPreviewViewportSpaceKeyMessage(pressed: boolean): PreviewViewportSpaceKeyMessage {
  return {
    type: WEBGAL_PREVIEW_VIEWPORT_SPACE_KEY,
    pressed,
  }
}

export function createPreviewOutputSettingsMessage(
  settings: Omit<PreviewOutputSettingsMessage, 'type'>,
): PreviewOutputSettingsMessage {
  return {
    type: WEBGAL_PREVIEW_OUTPUT_SETTINGS,
    ...settings,
  }
}
