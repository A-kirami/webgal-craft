import { colorToString, parseColor } from 'reka-ui'

import { usePreferenceStore } from '~/stores/preference'

export const RECENT_COLORS_LIMIT = 18

function normalizeRecentColor(color: string): string | undefined {
  try {
    // 应用内颜色字符串统一为大写 hex
    return colorToString(parseColor(color), 'hex').toUpperCase()
  } catch {
    return undefined
  }
}

export function useRecentColors() {
  const preferenceStore = usePreferenceStore()

  const recentColors = computed(() => preferenceStore.recentColors)

  function remember(color: string) {
    const normalized = normalizeRecentColor(color)
    if (!normalized) {
      return
    }

    // 去重按颜色判断：同一颜色的不同大小写写法视为同一条
    const rest = preferenceStore.recentColors.filter(item => item.toUpperCase() !== normalized)
    preferenceStore.recentColors = [normalized, ...rest].slice(0, RECENT_COLORS_LIMIT)
  }

  return {
    recentColors,
    remember,
  }
}
