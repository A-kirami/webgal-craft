import type {
  ChoiceField,
  ColorField,
  I18nLike,
} from '~/features/editor/command-registry/schema'
import type { EffectDialField, EffectNumberField, EffectRenderItem } from '~/features/editor/effect-editor/effect-editor-config'
import type { TransformScaleAxis } from '~/features/editor/effect-editor/transform-flip'
import type { EmitTransformOptions } from '~/features/editor/effect-editor/types'
import type { EffectSegmentedOption } from '~/features/editor/effect-editor/useEffectSegmentedControl'

export type EffectDraftLinkedNumberField = EffectNumberField & { linkedPairKey: string }

export type EffectDraftColorField = ColorField & {
  colorPaths: [string, string, string]
  colorDefaults: [number, number, number]
}

export interface EffectDraftCategoryRenderModel {
  key: string
  label: I18nLike
  items: EffectRenderItem[]
}

export type EffectDraftLabelResolver = (value: I18nLike | undefined) => string

export interface EffectDraftCategoryControls {
  numberInputId: (path: string) => string
  sliderInputId: (path: string) => string
  dialInputId: (path: string) => string
  colorControlId: (param: EffectDraftColorField) => string
  segmentedControlId: (path: string) => string
  getFieldValue: (path: string) => string
  getNumberValue: (path: string, fallback: number) => number
  updateNumberField: (param: EffectNumberField, rawValue: string, options?: { flush?: boolean, clampValue?: boolean }) => void
  canScrubNumber: (param: EffectNumberField) => boolean
  handleNumberLabelPointerDown: (event: PointerEvent, param: EffectNumberField) => void
  getSliderTrackValue: (param: EffectNumberField) => number[]
  getSliderMin: (param: EffectNumberField) => number | undefined
  getSliderMax: (param: EffectNumberField) => number | undefined
  getSliderStep: (param: EffectNumberField) => number | undefined
  getFieldUnit: (param: EffectNumberField | EffectDialField) => string | undefined
  getSliderInputValue: (param: EffectNumberField) => string
  updateSliderField: (param: EffectNumberField, rawValue: string | number, options?: { fromSlider?: boolean, flush?: boolean }) => void
  isLinkedSliderLocked: (param: EffectDraftLinkedNumberField) => boolean
  toggleLinkedSliderLock: (param: EffectDraftLinkedNumberField) => void
  getLinkedSliderLabel: (param: EffectDraftLinkedNumberField) => string
  getAxisCompactLabel: (path: string) => 'X' | 'Y'
  getLinkedSliderInputAriaLabel: (param: EffectDraftLinkedNumberField, index: 0 | 1) => string
  getLinkedSliderInputValue: (param: EffectDraftLinkedNumberField, index: 0 | 1) => string
  getLinkedSliderTrackValue: (param: EffectDraftLinkedNumberField, index: 0 | 1) => number[]
  updateLinkedSliderField: (
    param: EffectDraftLinkedNumberField,
    index: 0 | 1,
    rawValue: string | number,
    options?: { fromSlider?: boolean, flush?: boolean },
  ) => void
  getDialDegree: (param: EffectDialField) => number
  getDialIndicatorDegree: (degree: number) => number
  getDialInputValue: (param: EffectDialField) => string
  updateDialField: (param: EffectDialField, rawDegree: string | number, options?: { flush?: boolean }) => void
  handleDialPointerDown: (event: PointerEvent, param: EffectDialField) => void
  flipScaleAxis: (axis: TransformScaleAxis) => void
  getColorPickerValue: (param: EffectDraftColorField) => { b: number, g: number, r: number }
  handleColorPickerOpenChange: (param: EffectDraftColorField, open: boolean) => void
  handleColorPickerChange: (param: EffectDraftColorField, rawValue: unknown) => void
  getSegmentedValue: (param: ChoiceField) => string
  getSegmentedOptions: (param: ChoiceField) => EffectSegmentedOption[]
  updateSegmentedField: (param: ChoiceField, rawValue: string) => void
  canClearPaths: (paths: readonly string[]) => boolean
  clearPaths: (paths: readonly string[], options: EmitTransformOptions) => void
  getClearPropertyLabel: (label: I18nLike | undefined) => string
}
