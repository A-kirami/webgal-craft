import { describe, expect, it } from 'vitest'

import { normalizeRelativePath, toComparablePath } from '~/utils/path'

describe('路径工具', () => {
  it('toComparablePath 会统一分隔符、去掉末尾斜杠并转成小写', () => {
    expect(toComparablePath('C:\\Project\\Scenes\\Intro\\')).toBe('c:/project/scenes/intro')
    expect(toComparablePath('/Assets//Background/')).toBe('/assets//background')
  })

  it('normalizeRelativePath 会移除首尾斜杠并保留相对层级', () => {
    expect(normalizeRelativePath('\\scene\\chapter-1\\intro.txt\\')).toBe('scene/chapter-1/intro.txt')
    expect(normalizeRelativePath('/assets///bg/')).toBe('assets///bg')
    expect(normalizeRelativePath('')).toBe('')
  })
})
