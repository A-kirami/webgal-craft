import '~/__tests__/setup'

import { describe, expect, it } from 'vitest'

import { usePreferenceStore } from '~/stores/preference'

describe('usePreferenceStore', () => {
  it('提供默认视图偏好', () => {
    const store = usePreferenceStore()

    expect(store.viewMode).toBe('grid')
    expect(store.assetViewMode).toBe('grid')
    expect(store.defaultEngineId).toBeUndefined()
    expect(store.editorMode).toBe('text')
    expect(store.showSidebar).toBe(false)
    expect(store.assetZoom).toEqual([100])
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
})
