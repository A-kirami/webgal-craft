import '~/__tests__/setup'

import { createPinia, setActivePinia } from 'pinia'
import { createPersistedState } from 'pinia-plugin-persistedstate'
import { describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'

import { createMemoryStorage } from '~/__tests__/memory-storage'
import { useAppUpdateStore } from '~/stores/app-update'

describe('useAppUpdateStore', () => {
  it('记录可用更新时会清理旧版本的跳过状态', () => {
    const store = useAppUpdateStore()

    store.setAvailableUpdate({
      currentVersion: '1.0.0',
      version: '1.1.0',
    })
    store.skipVersion('1.1.0')

    store.setAvailableUpdate({
      currentVersion: '1.0.0',
      version: '1.2.0',
    })

    expect(store.skippedVersion).toBeUndefined()
    expect(store.isAvailableUpdateSkipped).toBe(false)
  })

  it('只持久化 skippedVersion，不恢复运行时下载状态', async () => {
    const storage = createMemoryStorage()
    const pinia = createPinia()
    pinia.use(createPersistedState({ storage }))
    createApp({}).use(pinia)
    setActivePinia(pinia)

    const firstStore = useAppUpdateStore()
    firstStore.setAvailableUpdate({
      currentVersion: '1.0.0',
      version: '1.1.0',
      body: 'changes',
    })
    firstStore.setUpdating()
    firstStore.updateDownloadProgress({ downloadedBytes: 10, totalBytes: 20 })
    firstStore.skipVersion('1.1.0')
    await nextTick()

    const restoredPinia = createPinia()
    restoredPinia.use(createPersistedState({ storage }))
    createApp({}).use(restoredPinia)
    setActivePinia(restoredPinia)

    const restoredStore = useAppUpdateStore()

    expect(restoredStore.skippedVersion).toBe('1.1.0')
    expect(restoredStore.status).toBe('idle')
    expect(restoredStore.availableUpdate).toBeUndefined()
    expect(restoredStore.downloadProgress).toBeUndefined()
  })
})
