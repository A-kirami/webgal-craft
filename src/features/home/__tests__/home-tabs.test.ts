import { describe, expect, it, vi } from 'vitest'

import {
  HOME_TABS,
  resolveHomeTabDefinition,
} from '~/features/home/home-tabs'
import { resolveI18nLike } from '~/utils/i18n-like'

describe('首页标签页定义', () => {
  it('按固定顺序暴露所有首页标签页', () => {
    expect(HOME_TABS.map(tab => tab.id)).toEqual(['recent', 'engines', 'templates'])
  })

  it('只为支持资源发现的标签页返回 discovery 类型', () => {
    expect(resolveHomeTabDefinition('recent').discoveryType).toBe('games')
    expect(resolveHomeTabDefinition('engines').discoveryType).toBe('engines')
    expect(resolveHomeTabDefinition('templates').discoveryType).toBe('templates')
  })

  it('通过静态分支解析标签页标题', () => {
    const t = vi.fn((key: string) => `translated:${key}`)

    expect(resolveI18nLike(resolveHomeTabDefinition('recent').label, t)).toBe('translated:home.tabs.recent')
    expect(resolveI18nLike(resolveHomeTabDefinition('engines').label, t)).toBe('translated:home.tabs.engines')
    expect(resolveI18nLike(resolveHomeTabDefinition('templates').label, t)).toBe('translated:home.tabs.templates')
  })

  it('通过静态分支解析搜索占位文案', () => {
    const t = vi.fn((key: string) => `translated:${key}`)

    expect(resolveI18nLike(resolveHomeTabDefinition('recent').searchPlaceholder, t)).toBe('translated:home.search.placeholder.recent')
    expect(resolveI18nLike(resolveHomeTabDefinition('engines').searchPlaceholder, t)).toBe('translated:home.search.placeholder.engines')
    expect(resolveI18nLike(resolveHomeTabDefinition('templates').searchPlaceholder, t)).toBe('translated:home.search.placeholder.templates')
  })
})
