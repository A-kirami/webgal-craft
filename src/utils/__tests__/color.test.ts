import { describe, expect, it } from 'vitest'

import { normalizeColorChannel, parseHexColor, rgbToHex } from '~/utils/color'

describe('normalizeColorChannel', () => {
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

describe('parseHexColor', () => {
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

  it('解析 8 位 hex 并忽略 alpha 通道', () => {
    expect(parseHexColor('#0c223880')).toEqual([12, 34, 56])
  })

  it('8 位 hex 含非法字符返回 undefined', () => {
    expect(parseHexColor('#0c2238zz')).toBeUndefined()
  })

  it('空字符串返回 undefined', () => {
    expect(parseHexColor('')).toBeUndefined()
  })
})

describe('rgbToHex', () => {
  it('拼接三通道为 6 位大写 hex', () => {
    expect(rgbToHex(12, 34, 56)).toBe('#0C2238')
  })

  it('0 与 255 边界正确补零', () => {
    expect(rgbToHex(0, 255, 0)).toBe('#00FF00')
  })

  it('超出范围的通道被钳制并取整', () => {
    expect(rgbToHex(300, -1, 127.6)).toBe('#FF0080')
  })

  it('非有限通道回退为 0', () => {
    expect(rgbToHex(Number.NaN, 0, 0)).toBe('#000000')
  })
})
