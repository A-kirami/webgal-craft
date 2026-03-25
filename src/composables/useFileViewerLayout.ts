import { computed, ref, toValue, watch } from 'vue'

import type { MaybeRefOrGetter } from 'vue'

const META_BREAKPOINT_FULL = 750
const META_BREAKPOINT_COMPACT = 560

interface UseFileViewerLayoutOptions {
  contentWidth: MaybeRefOrGetter<number>
  gridItemMinWidth?: MaybeRefOrGetter<number>
  zoom?: MaybeRefOrGetter<number | undefined>
}

export function clampFileViewerZoom(zoom: number | undefined): number {
  return Math.max(50, Math.min(150, zoom ?? 100))
}

/**
 * 根据宽度和当前密度计算目标密度（带迟滞缓冲，避免边界抖动）
 * 向上跨越断点需超过 breakpoint + buffer，向下需低于 breakpoint - buffer
 */
export function computeFileViewerMetaDensity(width: number, current: 1 | 2 | 3, buffer: number): 1 | 2 | 3 {
  const fullUp = META_BREAKPOINT_FULL + buffer
  const fullDown = META_BREAKPOINT_FULL - buffer
  const compactUp = META_BREAKPOINT_COMPACT + buffer
  const compactDown = META_BREAKPOINT_COMPACT - buffer

  if (current === 3) {
    if (width < compactDown) {
      return 1
    }
    if (width < fullDown) {
      return 2
    }
    return 3
  }
  if (current === 2) {
    if (width >= fullUp) {
      return 3
    }
    if (width < compactDown) {
      return 1
    }
    return 2
  }
  // current === 1
  if (width >= fullUp) {
    return 3
  }
  if (width >= compactUp) {
    return 2
  }
  return 1
}

export function useFileViewerLayout(options: UseFileViewerLayoutOptions) {
  const contentWidth = computed(() => toValue(options.contentWidth) || 0)
  const normalizedZoom = computed(() => clampFileViewerZoom(toValue(options.zoom)))
  const gridItemMinWidth = computed(() => Math.max(1, toValue(options.gridItemMinWidth) ?? 80))

  const gridItemWidth = computed(() => Math.max(48, Math.round(gridItemMinWidth.value * (normalizedZoom.value / 100))))
  const gridPreviewSize = computed(() => Math.max(40, Math.round(gridItemWidth.value * 0.8)))
  const gridItemHeight = computed(() => gridPreviewSize.value + 40)
  const gridIconSize = computed(() => Math.max(24, Math.round(gridPreviewSize.value * 0.75)))
  const listItemHeight = computed(() => Math.max(36, Math.round(40 * (normalizedZoom.value / 100))))
  const listPreviewSize = computed(() => Math.max(16, Math.round(20 * (normalizedZoom.value / 100))))

  const listMetaDensity = ref<1 | 2 | 3>(3)

  watch(
    () => [contentWidth.value, normalizedZoom.value] as const,
    ([width, zoom]) => {
      if (width <= 0) {
        listMetaDensity.value = 3
        return
      }
      const buffer = Math.max(12, Math.round(24 + (zoom - 100) * 0.2))
      listMetaDensity.value = computeFileViewerMetaDensity(width, listMetaDensity.value, buffer)
    },
    { immediate: true },
  )

  const showListSize = computed(() => listMetaDensity.value >= 2)
  const showListModifiedAt = computed(() => listMetaDensity.value >= 2)
  const showListCreatedAt = computed(() => listMetaDensity.value >= 3)
  const gridCols = computed(() => {
    const width = contentWidth.value || gridItemWidth.value
    return Math.max(1, Math.floor(width / gridItemWidth.value))
  })

  return {
    normalizedZoom,
    gridItemWidth,
    gridPreviewSize,
    gridItemHeight,
    gridIconSize,
    listItemHeight,
    listPreviewSize,
    listMetaDensity,
    showListSize,
    showListModifiedAt,
    showListCreatedAt,
    gridCols,
  }
}
