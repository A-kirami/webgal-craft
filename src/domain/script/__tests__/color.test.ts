import { describe, expect, it } from 'vitest'

import { classifyColorText } from '../color'

describe('classifyColorText', () => {
  it.each([
    '#f00',
    '#FF0000',
    '#4a90e2ff',
    '  #4A90E2  ',
    'rgb(74, 144, 226)',
    'rgba(74, 144, 226, 0.5)',
    'rgb(74, 144, 226, 0.5)',
    'rgb(300, 0, 0)',
    'hsl(210, 100%, 70%)',
    'hsla(210, 100%, 70%, .5)',
    'hsb(210, 60%, 100%)',
    'hsba(210, 60%, 100%, 0.5)',
  ])('把 %s 判为编辑器可解析', (value) => {
    expect(classifyColorText(value)).toBe('supported')
  })

  it.each([
    'red',
    'transparent',
    'currentColor',
    'rebeccapurple',
    '#4a9f',
    'rgb(100%, 0%, 0%)',
    'rgb(0 0 0 / 50%)',
    'hsl(210 100% 70%)',
    'hsl(210, 100, 70)',
    'hsv(210, 60%, 100%)',
    'hwb(210 20% 20%)',
    'oklch(0.7 0.1 200)',
    'lab(50% 40 59.5)',
    'color(display-p3 1 0 0)',
  ])('把 %s 判为语法是色值但编辑器不支持', (value) => {
    expect(classifyColorText(value)).toBe('unsupported')
  })

  it.each([
    '#zzz',
    '#ab',
    '#abcde',
    '#12C0000',
    '4a90e2',
    'not-a-color',
    '12px',
    '',
    ' '.repeat(3),
  ])('把 %s 判为无法识别的色值', (value) => {
    expect(classifyColorText(value)).toBe('invalid')
  })

  it('拼错的标识符归入 unsupported 而不是 invalid', () => {
    // 无法区分命名色与拼错的标识符，宁可提示"格式不受支持"也不断言引擎渲染不出来
    expect(classifyColorText('rad')).toBe('unsupported')
  })
})
