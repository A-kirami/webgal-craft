import { defineStore } from 'pinia'

export const useEditSettingsStore = defineStore(
  'edit-settings',
  () => {
    const fontFamily = $ref('FiraCode, SourceHanSans, Consolas, "Courier New", monospace')
    const fontSize = $ref(14)
    const wordWrap = $ref(true)
    const minimap = $ref(false)
    const autoSave = $ref(true)
    const enablePreviewTab = $ref(true)
    const autoApplyEffectEditorChanges = $ref(false)
    const effectEditorSide = $ref<'left' | 'right'>('right')
    const collapseStatementsOnSidebarOpen = $ref(true)
    const showSidebarAssetPreview = $ref(true)
    const commandInsertPosition = $ref<'afterCursor' | 'end'>('afterCursor')

    return $$({
      fontFamily,
      fontSize,
      wordWrap,
      minimap,
      autoSave,
      enablePreviewTab,
      autoApplyEffectEditorChanges,
      effectEditorSide,
      collapseStatementsOnSidebarOpen,
      showSidebarAssetPreview,
      commandInsertPosition,
    })
  },
  {
    persist: true,
  },
)
