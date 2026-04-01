import type { I18nLike } from '~/utils/i18n-like'

type HomeTabDiscoveryType = 'games' | 'engines'
export type HomeTabId = 'recent' | 'engines'

interface HomeTabDefinition {
  id: HomeTabId
  discoveryType: HomeTabDiscoveryType
  label: I18nLike
  searchPlaceholder: I18nLike
}

export const HOME_TABS = [
  {
    id: 'recent',
    discoveryType: 'games',
    label: t => t('home.tabs.recent'),
    searchPlaceholder: t => t('home.search.placeholder.recent'),
  },
  {
    id: 'engines',
    discoveryType: 'engines',
    label: t => t('home.tabs.engines'),
    searchPlaceholder: t => t('home.search.placeholder.engines'),
  },
] as const satisfies readonly HomeTabDefinition[]

export function resolveHomeTabDefinition(tabId: HomeTabId): (typeof HOME_TABS)[number] {
  const tab = HOME_TABS.find(item => item.id === tabId)
  if (tab) {
    return tab
  }

  throw new Error(`Unsupported home tab: ${tabId}`)
}
