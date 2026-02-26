export interface Point2D {
  x: number
  y: number
}

export interface Transform {
  alpha: number
  scale: Point2D
  position: Point2D
  rotation: number
  blur: number
  brightness: number
  contrast: number
  saturation: number
  gamma: number
  colorRed: number
  colorGreen: number
  colorBlue: number
  bevel: number
  bevelThickness: number
  bevelRotation: number
  bevelSoftness: number
  bevelRed: number
  bevelGreen: number
  bevelBlue: number
  bloom: number
  bloomBrightness: number
  bloomBlur: number
  bloomThreshold: number
  shockwaveFilter: number
  radiusAlphaFilter: number
}
