import { describe, expect, it } from 'vitest'

import { classifyColorText } from '~/domain/script/color'

import { formatHexValue, hasExplicitAlpha, normalizeHexText } from '../hex-text'

describe('normalizeHexText', () => {
  it('越界的 RGB 分量按 CSS 语义裁剪', () => {
    expect(formatHexValue(normalizeHexText('rgb(300, 0, 0)'))).toBe('#FF0000')
  })

  it('越界的饱和度与亮度裁剪到 100%', () => {
    expect(formatHexValue(normalizeHexText('hsl(210, 120%, 150%)'))).toBe('#FFFFFF')
  })

  it('色相越界交给 reka 回绕，与 CSS 取模语义一致', () => {
    // hsl(400, …) 等同 hsl(40, …) = #FFAA00；裁剪到 360 会错误地变成纯红
    expect(formatHexValue(normalizeHexText('hsl(400, 100%, 50%)'))).toBe('#FFAA00')
  })

  it('透明度越界裁剪到 1', () => {
    expect(normalizeHexText('rgba(102, 204, 255, 2)')).toMatchObject({ alpha: 1 })
  })

  it('范围内的分量保持原精度', () => {
    expect(normalizeHexText('hsl(210, 33.3%, 66.7%)')).toMatchObject({ s: 33.3, l: 66.7 })
  })

  it('分量非有限值（正则放行的 `rgb(., 0, 0)`）按非法输入抛错', () => {
    expect(() => normalizeHexText('rgb(., 0, 0)')).toThrow()
  })
})

describe('与脚本色值分类（classifyColorText）的契约', () => {
  // 分类为 supported 的值不会有诊断，字段必须能真正解析它，否则用户既看不到提示、输入又被静默拒绝
  it.each([
    '#f00',
    '#4a90e2',
    '#4a90e2ff',
    'rgb(74, 144, 226)',
    'rgba(74, 144, 226, 0.5)',
    'rgb(300, 0, 0)',
    'hsl(210, 100%, 70%)',
    'hsla(210, 100%, 70%, .5)',
    'hsb(210, 60%, 100%)',
    'hsba(210, 60%, 100%, 0.5)',
  ])('不会拒绝分类为可编辑的 %s', (value) => {
    expect(classifyColorText(value)).toBe('supported')
    expect(() => normalizeHexText(value)).not.toThrow()
  })

  // 需要诊断的值必须走"非法输入保持原值"路径，不能被字段悄悄改写（裸 hex 是字段的输入便利，不在此列）
  it.each([
    'red',
    '#4a9f',
    'rgb(100%, 0%, 0%)',
    'hsv(210, 60%, 100%)',
    '#zzz',
    '#12C0000',
  ])('拒绝需要诊断的 %s', (value) => {
    expect(classifyColorText(value)).not.toBe('supported')
    expect(() => normalizeHexText(value)).toThrow()
  })
})

describe('hasExplicitAlpha', () => {
  it('8 位 hex 视为自带透明度', () => {
    expect(hasExplicitAlpha('#66CCFF80')).toBe(true)
    expect(hasExplicitAlpha('66CCFF80')).toBe(true)
  })

  it('6 位与 3 位 hex 不带透明度', () => {
    expect(hasExplicitAlpha('#66CCFF')).toBe(false)
    expect(hasExplicitAlpha('f00')).toBe(false)
  })

  it('函数式的第 4 个分量视为透明度，与函数名是否带 a 无关', () => {
    expect(hasExplicitAlpha('rgba(102, 204, 255, 0.5)')).toBe(true)
    expect(hasExplicitAlpha('rgb(102, 204, 255, 0.5)')).toBe(true)
    expect(hasExplicitAlpha('hsla(210, 100%, 70%, 0.5)')).toBe(true)
  })

  it('只有 3 个分量的函数式写法不带透明度', () => {
    expect(hasExplicitAlpha('rgb(102, 204, 255)')).toBe(false)
    expect(hasExplicitAlpha('rgba(102, 204, 255)')).toBe(false)
    expect(hasExplicitAlpha('hsl(210, 100%, 70%)')).toBe(false)
  })

  it('忽略首尾空白', () => {
    expect(hasExplicitAlpha('  #66CCFF80  ')).toBe(true)
  })
})
