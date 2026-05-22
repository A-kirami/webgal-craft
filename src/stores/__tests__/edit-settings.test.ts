import '~/__tests__/setup'

import { describe, expect, it } from 'vitest'

import { useEditSettingsStore } from '~/stores/edit-settings'

describe('useEditSettingsStore', () => {
  it('提供稳定的编辑器默认配置', () => {
    const store = useEditSettingsStore()

    expect(store.fontFamily).toContain('FiraCode')
    expect(store.fontSize).toBe(14)
    expect(store.wordWrap).toBe(true)
    expect(store.minimap).toBe(false)
    expect(store.effectEditorSide).toBe('right')
    expect(store.commandInsertPosition).toBe('afterCursor')
    expect(store.enableComboboxPathDelimiter).toBe(true)
    expect(store.comboboxPathDelimiter).toBe('/')
    expect(store.enableLivePreview).toBe(true)
    expect(store.enableRealtimeEffectPreview).toBe(true)
  })

  it('支持更新标签页、预览和效果编辑相关偏好', () => {
    const store = useEditSettingsStore()

    store.enablePreviewTab = false
    store.enableLivePreview = false
    store.enableRealtimeEffectPreview = false
    store.autoApplyEffectEditorChanges = true
    store.effectEditorSide = 'left'
    store.commandInsertPosition = 'end'
    store.enableComboboxPathDelimiter = false
    store.comboboxPathDelimiter = '>'

    expect(store.enablePreviewTab).toBe(false)
    expect(store.enableLivePreview).toBe(false)
    expect(store.enableRealtimeEffectPreview).toBe(false)
    expect(store.autoApplyEffectEditorChanges).toBe(true)
    expect(store.effectEditorSide).toBe('left')
    expect(store.commandInsertPosition).toBe('end')
    expect(store.enableComboboxPathDelimiter).toBe(false)
    expect(store.comboboxPathDelimiter).toBe('>')
  })
})
