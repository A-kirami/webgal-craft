import '~/__tests__/setup'

import { createPinia, setActivePinia } from 'pinia'
import { createPersistedState } from 'pinia-plugin-persistedstate'
import { describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'

import { createMemoryStorage } from '~/__tests__/memory-storage'
import { OFFICIAL_WEBGAL_ENGINE_ID, OFFICIAL_WEBGAL_ENGINE_NAME } from '~/domain/engine/official-release'
import { useOfficialEngineReleaseCacheStore } from '~/stores/official-engine-release-cache'

import type { OfficialEngineRelease } from '~/domain/engine/official-release'

function createRelease(version: string): OfficialEngineRelease {
  return {
    assetName: `WebGAL-${version}-web.zip`,
    assetUrl: `https://example.com/${version}.zip`,
    engineId: OFFICIAL_WEBGAL_ENGINE_ID,
    name: OFFICIAL_WEBGAL_ENGINE_NAME,
    releaseUrl: `https://example.com/releases/${version}`,
    sha256: 'a'.repeat(64),
    version,
  }
}

function activatePersistedPinia(storage: ReturnType<typeof createMemoryStorage>): void {
  const pinia = createPinia()
  pinia.use(createPersistedState({ storage }))
  createApp({}).use(pinia)
  setActivePinia(pinia)
}

describe('useOfficialEngineReleaseCacheStore', () => {
  it('持久化发布列表和最新版本标签', async () => {
    const storage = createMemoryStorage()
    activatePersistedPinia(storage)

    const store = useOfficialEngineReleaseCacheStore()
    store.replaceReleases([createRelease('4.6.4'), createRelease('4.6.3')], '4.6.4')
    await nextTick()

    activatePersistedPinia(storage)
    const restoredStore = useOfficialEngineReleaseCacheStore()

    expect(restoredStore.latestVersion).toBe('4.6.4')
    expect(restoredStore.releases.map(release => release.version)).toEqual(['4.6.4', '4.6.3'])
  })
})
