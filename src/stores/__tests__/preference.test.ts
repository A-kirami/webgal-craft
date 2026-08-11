import '~/__tests__/setup'

import { createPinia, setActivePinia } from 'pinia'
import { createPersistedState } from 'pinia-plugin-persistedstate'
import { describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'

import { createMemoryStorage } from '~/__tests__/memory-storage'
import { usePreferenceStore } from '~/stores/preference'

function activatePersistedPinia(storage: ReturnType<typeof createMemoryStorage>): void {
  const pinia = createPinia()
  pinia.use(createPersistedState({ storage }))
  createApp({}).use(pinia)
  setActivePinia(pinia)
}

describe('usePreferenceStore', () => {
  it('提供默认视图偏好', () => {
    const store = usePreferenceStore()

    expect(store.viewMode).toBe('grid')
    expect(store.assetViewMode).toBe('grid')
    expect(store.defaultEngineId).toBeUndefined()
    expect(store.editorMode).toBe('text')
    expect(store.showSidebar).toBe(false)
    expect(store.assetZoom).toEqual([100])
    expect(store.previewVolume).toEqual([100])
    expect(store.previewMuted).toBe(false)
    expect(store.previewBrightness).toEqual([100])
    expect(store.previewBrightnessEnabled).toBe(true)
  })

  it('支持更新文件选择器和效果编辑器偏好', () => {
    const store = usePreferenceStore()

    store.filePickerViewMode = 'list'
    store.filePickerZoomLevel = 'large'
    store.filePickerShowRecentHistory = true
    store.effectEditorLinkedSliderLocks.scale = true

    expect(store.filePickerViewMode).toBe('list')
    expect(store.filePickerZoomLevel).toBe('large')
    expect(store.filePickerShowRecentHistory).toBe(true)
    expect(store.effectEditorLinkedSliderLocks).toEqual({ scale: true })
  })

  it('持久化并恢复预览音量与亮度偏好', async () => {
    const storage = createMemoryStorage()
    activatePersistedPinia(storage)

    const store = usePreferenceStore()
    store.previewVolume = [42]
    store.previewMuted = true
    store.previewBrightness = [68]
    store.previewBrightnessEnabled = false
    await nextTick()

    activatePersistedPinia(storage)
    const restoredStore = usePreferenceStore()

    expect(restoredStore.previewVolume).toEqual([42])
    expect(restoredStore.previewMuted).toBe(true)
    expect(restoredStore.previewBrightness).toEqual([68])
    expect(restoredStore.previewBrightnessEnabled).toBe(false)
  })
})
