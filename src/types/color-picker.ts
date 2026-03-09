export interface ColorPickerAlpha {
  a: number
}

export interface ColorPickerPrgb {
  b: string
  g: string
  r: string
}

export interface ColorPickerPrgba extends ColorPickerPrgb, ColorPickerAlpha {}

export interface ColorPickerRgb {
  b: number
  g: number
  r: number
}

export interface ColorPickerRgba extends ColorPickerRgb, ColorPickerAlpha {}

export interface ColorPickerHsl {
  h: number
  l: number
  s: number
}

export interface ColorPickerHsla extends ColorPickerHsl, ColorPickerAlpha {}

export interface ColorPickerHsv {
  h: number
  s: number
  v: number
}

export interface ColorPickerHsva extends ColorPickerHsv, ColorPickerAlpha {}

export type ColorPickerValue =
  | string
  | ColorPickerPrgb
  | ColorPickerPrgba
  | ColorPickerRgb
  | ColorPickerRgba
  | ColorPickerHsl
  | ColorPickerHsla
  | ColorPickerHsv
  | ColorPickerHsva
