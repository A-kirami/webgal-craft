export type IconEditorShape = 'square' | 'rounded' | 'circle'
export type IconEditorBackgroundType = 'color' | 'image'

export interface IconEditorOffsetRatio {
  x: number
  y: number
}

export interface IconEditorImageSource {
  bytes: Uint8Array
  image: HTMLImageElement
}

export interface IconEditorState {
  backgroundColor: string
  backgroundImage?: IconEditorImageSource
  backgroundOffsetRatio: IconEditorOffsetRatio
  backgroundScale: number
  backgroundType: IconEditorBackgroundType
  foregroundImage?: IconEditorImageSource
  foregroundOffsetRatio: IconEditorOffsetRatio
  foregroundScale: number
  iconShape: IconEditorShape
}

export interface PersistedIconEditorState {
  backgroundColor: string
  backgroundOffsetRatio: IconEditorOffsetRatio
  backgroundScale: number
  backgroundType: IconEditorBackgroundType
  foregroundOffsetRatio: IconEditorOffsetRatio
  foregroundScale: number
  iconShape: IconEditorShape
  version: 1
}

export const ICON_EDITOR_CANVAS_SIZE = 1536
export const ICON_EDITOR_DEFAULT_BACKGROUND_COLOR = '#FFFFFF'
export const ICON_EDITOR_DEFAULT_SCALE = 1
export const ICON_EDITOR_STATE_VERSION = 1

export function createDefaultIconEditorState(): IconEditorState {
  return {
    backgroundColor: ICON_EDITOR_DEFAULT_BACKGROUND_COLOR,
    backgroundOffsetRatio: { x: 0, y: 0 },
    backgroundScale: ICON_EDITOR_DEFAULT_SCALE,
    backgroundType: 'color',
    foregroundOffsetRatio: { x: 0, y: 0 },
    foregroundScale: ICON_EDITOR_DEFAULT_SCALE,
    iconShape: 'square',
  }
}

export function createPersistedIconEditorState(state: IconEditorState): PersistedIconEditorState {
  return {
    backgroundColor: state.backgroundColor,
    backgroundOffsetRatio: { ...state.backgroundOffsetRatio },
    backgroundScale: state.backgroundScale,
    backgroundType: state.backgroundType,
    foregroundOffsetRatio: { ...state.foregroundOffsetRatio },
    foregroundScale: state.foregroundScale,
    iconShape: state.iconShape,
    version: ICON_EDITOR_STATE_VERSION,
  }
}
