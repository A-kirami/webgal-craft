import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { RECENT_COLORS_LIMIT, useRecentColors } from '~/composables/useRecentColors'
import { usePreferenceStore } from '~/stores/preference'

describe('useRecentColors', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('记录颜色并规范化为大写 hex', () => {
    const { recentColors, remember } = useRecentColors()

    remember('#ff8000')

    expect(recentColors.value).toEqual(['#FF8000'])
  })

  it('新颜色插入到最前', () => {
    const { recentColors, remember } = useRecentColors()

    remember('#FF8000')
    remember('#00FF00')

    expect(recentColors.value).toEqual(['#00FF00', '#FF8000'])
  })

  it('重复颜色去重并提前', () => {
    const { recentColors, remember } = useRecentColors()

    remember('#FF8000')
    remember('#00FF00')
    remember('#ff8000')

    expect(recentColors.value).toEqual(['#FF8000', '#00FF00'])
  })

  it('半透明颜色保留 alpha 通道为 8 位 hex', () => {
    const { recentColors, remember } = useRecentColors()

    remember('rgba(12, 34, 56, 0.5)')

    expect(recentColors.value).toEqual(['#0C223880'])
  })

  it('非法输入被忽略', () => {
    const { recentColors, remember } = useRecentColors()

    remember('not-a-color')
    remember('')

    expect(recentColors.value).toEqual([])
  })

  it('超过上限时淘汰最旧的记录', () => {
    const preferenceStore = usePreferenceStore()
    const toHexKey = (index: number) => `#0000${index.toString(16).padStart(2, '0').toUpperCase()}`
    const oldest = toHexKey(RECENT_COLORS_LIMIT - 1)
    const secondOldest = toHexKey(RECENT_COLORS_LIMIT - 2)
    preferenceStore.recentColors = Array.from({ length: RECENT_COLORS_LIMIT }, (_, index) => toHexKey(index))
    const { recentColors, remember } = useRecentColors()

    remember('#ffffff')

    expect(recentColors.value).toHaveLength(RECENT_COLORS_LIMIT)
    expect(recentColors.value[0]).toBe('#FFFFFF')
    expect(recentColors.value.at(-1)).toBe(secondOldest)
    expect(recentColors.value).not.toContain(oldest)
  })
})
