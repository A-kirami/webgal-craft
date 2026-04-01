import { describe, expect, it, vi } from 'vitest'

import {
  HOME_TABS,
  resolveHomeTabDefinition,
} from '~/features/home/home-tabs'
import { resolveI18nLike } from '~/utils/i18n-like'

describe('首页 tab 定义', () => {
  it('按固定顺序暴露所有首页 tab', () => {
    expect(HOME_TABS.map(tab => tab.id)).toEqual(['recent', 'engines'])
  })

  it('只为支持资源发现的 tab 返回 discovery 类型', () => {
    expect(resolveHomeTabDefinition('recent').discoveryType).toBe('games')
    expect(resolveHomeTabDefinition('engines').discoveryType).toBe('engines')
  })

  it('通过静态分支解析 tab 标题', () => {
    const t = vi.fn((key: string) => `translated:${key}`)

    expect(resolveI18nLike(resolveHomeTabDefinition('recent').label, t)).toBe('translated:home.tabs.recent')
    expect(resolveI18nLike(resolveHomeTabDefinition('engines').label, t)).toBe('translated:home.tabs.engines')
  })

  it('通过静态分支解析搜索占位文案', () => {
    const t = vi.fn((key: string) => `translated:${key}`)

    expect(resolveI18nLike(resolveHomeTabDefinition('recent').searchPlaceholder, t)).toBe('translated:home.search.placeholder.recent')
    expect(resolveI18nLike(resolveHomeTabDefinition('engines').searchPlaceholder, t)).toBe('translated:home.search.placeholder.engines')
  })
})
