import type {
  ChoiceField,
  ColorField,
  DialField,
  I18nLike,
  NumberField,
} from '~/features/editor/command-registry/schema'
import type { EffectRenderItem } from '~/features/editor/effect-editor/effect-editor-config'
import type { EffectSegmentedOption } from '~/features/editor/effect-editor/useEffectSegmentedControl'

export type EffectDraftLinkedNumberField = NumberField & { linkedPairKey: string }

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
  updateNumberField: (param: NumberField, rawValue: string, options?: { flush?: boolean, clampValue?: boolean }) => void
  canScrubNumber: (param: NumberField) => boolean
  handleNumberLabelPointerDown: (event: PointerEvent, param: NumberField) => void
  getSliderTrackValue: (param: NumberField) => number[]
  getSliderInputValue: (param: NumberField) => string
  updateSliderField: (param: NumberField, rawValue: string | number, options?: { fromSlider?: boolean, flush?: boolean }) => void
  flushSliderField: (param: NumberField) => void
  isLinkedSliderLocked: (param: EffectDraftLinkedNumberField) => boolean
  toggleLinkedSliderLock: (param: EffectDraftLinkedNumberField) => void
  getLinkedSliderLabel: (param: EffectDraftLinkedNumberField) => string
  getAxisCompactLabel: (path: string) => 'X' | 'Y'
  getLinkedSliderInputAriaLabel: (param: EffectDraftLinkedNumberField, index: 0 | 1) => string
  getLinkedSliderInputValue: (param: EffectDraftLinkedNumberField, index: 0 | 1) => string
  updateLinkedSliderField: (
    param: EffectDraftLinkedNumberField,
    index: 0 | 1,
    rawValue: string | number,
    options?: { fromSlider?: boolean, flush?: boolean },
  ) => void
  flushLinkedSliderField: (param: EffectDraftLinkedNumberField, index: 0 | 1) => void
  getDialDegree: (param: DialField) => number
  getDialIndicatorDegree: (degree: number) => number
  getDialInputValue: (param: DialField) => string
  updateDialField: (param: DialField, rawDegree: string | number) => void
  flushDialField: (param: DialField) => void
  handleDialPointerDown: (event: PointerEvent, param: DialField) => void
  getColorPickerValue: (param: EffectDraftColorField) => { b: number, g: number, r: number }
  handleColorPickerPointerDown: (event: PointerEvent, param: EffectDraftColorField) => void
  handleColorPickerChange: (param: EffectDraftColorField, rawValue: unknown) => void
  getSegmentedValue: (param: ChoiceField) => string
  getSegmentedOptions: (param: ChoiceField) => EffectSegmentedOption[]
  updateSegmentedField: (param: ChoiceField, rawValue: string) => void
}
