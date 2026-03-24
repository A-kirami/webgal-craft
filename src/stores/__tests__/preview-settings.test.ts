import '~/__tests__/setup'

import { describe, expect, it } from 'vitest'

import { usePreviewSettingsStore } from '~/stores/preview-settings'

describe('预览设置状态仓库', () => {
  it('初始化时包含预览相关默认值', () => {
    const store = usePreviewSettingsStore()

    expect(store.enableLivePreview).toBe(true)
    expect(store.enableFastPreview).toBe(false)
    expect(store.enableRealtimeEffectPreview).toBe(true)
  })

  it('允许单独切换各预览开关', () => {
    const store = usePreviewSettingsStore()

    store.enableLivePreview = false
    store.enableFastPreview = true
    store.enableRealtimeEffectPreview = false

    expect(store.enableLivePreview).toBe(false)
    expect(store.enableFastPreview).toBe(true)
    expect(store.enableRealtimeEffectPreview).toBe(false)
  })
})
