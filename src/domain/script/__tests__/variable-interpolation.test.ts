import { describe, expect, it } from 'vitest'

import { hasVariableInterpolation } from '../variable-interpolation'

describe('hasVariableInterpolation', () => {
  it('识别只含变量的文本', () => {
    expect(hasVariableInterpolation('{chapter}')).toBe(true)
    expect(hasVariableInterpolation('{ chapter }')).toBe(true)
    expect(hasVariableInterpolation('{a}{b}')).toBe(true)
  })

  it('识别与字面文本混写的变量', () => {
    expect(hasVariableInterpolation('bg_{chapter}.png')).toBe(true)
    expect(hasVariableInterpolation('{var}.txt')).toBe(true)
    expect(hasVariableInterpolation('chapter{item}')).toBe(true)
  })

  it('空花括号不算变量', () => {
    expect(hasVariableInterpolation('{}')).toBe(false)
    expect(hasVariableInterpolation('bg_{}.png')).toBe(false)
    expect(hasVariableInterpolation('{}a{}')).toBe(false)
  })

  it('花括号不配对时按字面文本处理', () => {
    expect(hasVariableInterpolation('{chapter')).toBe(false)
    expect(hasVariableInterpolation('chapter}')).toBe(false)
    expect(hasVariableInterpolation('}chapter{')).toBe(false)
    expect(hasVariableInterpolation('bg_{chapter.png')).toBe(false)
    expect(hasVariableInterpolation('bg_chapter}.png')).toBe(false)
  })

  it('没有花括号的文本不含变量', () => {
    expect(hasVariableInterpolation('')).toBe(false)
    expect(hasVariableInterpolation('chapter1/night.png')).toBe(false)
  })
})
