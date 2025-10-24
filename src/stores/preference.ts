import { defineStore } from 'pinia'

export const usePreferenceStore = defineStore(
  'preference',
  () => {
    const viewMode = $ref<'grid' | 'list'>('grid')
    const assetViewMode = $ref<'grid' | 'list'>('grid')
    const editorMode = $ref<'text' | 'visual'>('text')
    const assetZoom = $ref<[number]>([100])

    return $$({
      viewMode,
      assetViewMode,
      editorMode,
      assetZoom,
    })
  },
  {
    persist: true,
  },
)
