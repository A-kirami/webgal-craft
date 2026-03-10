import { defineStore } from 'pinia'

export const usePreferenceStore = defineStore(
  'preference',
  () => {
    const viewMode = $ref<'grid' | 'list'>('grid')
    const assetViewMode = $ref<'grid' | 'list'>('grid')
    const assetSortBy = $ref<FileViewerSortBy>('name')
    const assetSortOrder = $ref<FileViewerSortOrder>('asc')
    const editorMode = $ref<'text' | 'visual'>('text')
    const showSidebar = $ref(true)
    const assetZoom = $ref<[number]>([100])
    const filePickerViewMode = $ref<'grid' | 'list' | undefined>()
    const filePickerZoomLevel = $ref<'small' | 'medium' | 'large' | 'extraLarge' | undefined>()
    const filePickerShowRecentHistory = $ref<boolean | undefined>()
    const skipDeleteFileConfirm = $ref(false)
    const effectEditorLinkedSliderLocks = $ref<Record<string, boolean>>({})

    return $$({
      viewMode,
      assetViewMode,
      assetSortBy,
      assetSortOrder,
      editorMode,
      showSidebar,
      assetZoom,
      filePickerViewMode,
      filePickerZoomLevel,
      filePickerShowRecentHistory,
      skipDeleteFileConfirm,
      effectEditorLinkedSliderLocks,
    })
  },
  {
    persist: true,
  },
)
