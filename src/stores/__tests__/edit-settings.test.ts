import '~/__tests__/setup'

import { describe, expect, it } from 'vitest'

import { useEditSettingsStore } from '~/stores/edit-settings'

describe('编辑设置状态仓库', () => {
  it('提供稳定的编辑器默认配置', () => {
    const store = useEditSettingsStore()

    expect(store.fontFamily).toContain('FiraCode')
    expect(store.fontSize).toBe(14)
    expect(store.wordWrap).toBe(true)
    expect(store.minimap).toBe(false)
    expect(store.effectEditorSide).toBe('right')
    expect(store.commandInsertPosition).toBe('afterCursor')
  })

  it('支持更新预览和效果编辑相关偏好', () => {
    const store = useEditSettingsStore()

    store.enablePreviewTab = false
    store.autoApplyEffectEditorChanges = true
    store.effectEditorSide = 'left'
    store.commandInsertPosition = 'end'

    expect(store.enablePreviewTab).toBe(false)
    expect(store.autoApplyEffectEditorChanges).toBe(true)
    expect(store.effectEditorSide).toBe('left')
    expect(store.commandInsertPosition).toBe('end')
  })
})
