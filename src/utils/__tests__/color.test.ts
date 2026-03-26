import { describe, expect, it } from 'vitest'

import { extractRgbColor, isRgbaPayload, isRgbColor, normalizeColorChannel, parseHexColor } from '~/utils/color'

function createNullValue(): unknown {
  // eslint-disable-next-line unicorn/no-null -- 测试需要显式传入 null
  return null
}

describe('normalizeColorChannel 颜色通道归一化', () => {
  it('对正常范围内的值进行四舍五入', () => {
    expect(normalizeColorChannel(127.6, 0)).toBe(128)
  })

  it('将负数钳制到 0', () => {
    expect(normalizeColorChannel(-10, 0)).toBe(0)
  })

  it('将超过 255 的值钳制到 255', () => {
    expect(normalizeColorChannel(300, 0)).toBe(255)
  })

  it('NaN 返回 fallback', () => {
    expect(normalizeColorChannel(Number.NaN, 42)).toBe(42)
  })

  it('Infinity 返回 fallback', () => {
    expect(normalizeColorChannel(Number.POSITIVE_INFINITY, 99)).toBe(99)
  })
})

describe('parseHexColor 十六进制颜色解析', () => {
  it('解析 3 位简写 #fff', () => {
    expect(parseHexColor('#fff')).toEqual([255, 255, 255])
  })

  it('解析 3 位大写简写 #FFF', () => {
    expect(parseHexColor('#FFF')).toEqual([255, 255, 255])
  })

  it('解析 6 位 #ffffff', () => {
    expect(parseHexColor('#ffffff')).toEqual([255, 255, 255])
  })

  it('解析 6 位大写 #FFFFFF', () => {
    expect(parseHexColor('#FFFFFF')).toEqual([255, 255, 255])
  })

  it('解析带前后空格的值', () => {
    expect(parseHexColor('  #0a1b2c  ')).toEqual([10, 27, 44])
  })

  it('非法长度（5 位）返回 undefined', () => {
    expect(parseHexColor('#abcde')).toBeUndefined()
  })

  it('包含非十六进制字符返回 undefined', () => {
    expect(parseHexColor('#gggggg')).toBeUndefined()
  })

  it('空字符串返回 undefined', () => {
    expect(parseHexColor('')).toBeUndefined()
  })
})

describe('isRgbColor RGB 颜色校验', () => {
  it('合法 RgbColor 返回 true', () => {
    expect(isRgbColor({ r: 0, g: 128, b: 255 })).toBe(true)
  })

  it('null 返回 false', () => {
    expect(isRgbColor(createNullValue())).toBe(false)
  })

  it('缺少属性返回 false', () => {
    expect(isRgbColor({ r: 0, g: 128 })).toBe(false)
  })
})

describe('isRgbaPayload RGBA 载荷校验', () => {
  it('合法 RgbaPayload 返回 true', () => {
    expect(isRgbaPayload({ rgba: { r: 0, g: 0, b: 0 } })).toBe(true)
  })

  it('rgba 不是 RgbColor 返回 false', () => {
    expect(isRgbaPayload({ rgba: 'red' })).toBe(false)
  })
})

describe('extractRgbColor 颜色提取', () => {
  it('字符串走 parseHexColor 路径', () => {
    expect(extractRgbColor('#ff8000')).toEqual([255, 128, 0])
  })

  it('RgbaPayload 走归一化路径', () => {
    expect(extractRgbColor({ rgba: { r: 300, g: -1, b: 127.7 } })).toEqual([255, 0, 128])
  })

  it('RgbColor 走归一化路径', () => {
    expect(extractRgbColor({ r: 0.4, g: 254.6, b: 100 })).toEqual([0, 255, 100])
  })

  it('null 返回 undefined', () => {
    expect(extractRgbColor(createNullValue())).toBeUndefined()
  })

  it('undefined 返回 undefined', () => {
    expect(extractRgbColor(undefined)).toBeUndefined()
  })
})
