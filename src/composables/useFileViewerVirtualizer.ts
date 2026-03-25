import { useVirtualizer } from '@tanstack/vue-virtual'
import { computed, toValue } from 'vue'

import type { MaybeRefOrGetter } from 'vue'
import type { FileViewerItem, FileViewerVirtualRow } from '~/types/file-viewer'

interface UseFileViewerVirtualizerOptions {
  viewMode: MaybeRefOrGetter<'list' | 'grid'>
  sortedItems: MaybeRefOrGetter<FileViewerItem[]>
  gridCols: MaybeRefOrGetter<number>
  gridItemHeight: MaybeRefOrGetter<number>
  listItemHeight: MaybeRefOrGetter<number>
  viewportElement: MaybeRefOrGetter<HTMLElement | undefined>
}

const EMPTY_LIST_ITEM: FileViewerItem = {
  name: '',
  path: '',
  isDir: false,
}

export function useFileViewerVirtualizer(options: UseFileViewerVirtualizerOptions) {
  const viewMode = computed(() => toValue(options.viewMode))
  const sortedItems = computed(() => toValue(options.sortedItems))
  const gridCols = computed(() => Math.max(1, toValue(options.gridCols)))

  const rowCount = computed(() => Math.ceil(sortedItems.value.length / gridCols.value))
  const showListHeader = computed(() => viewMode.value === 'list')

  const rowVirtualizer = useVirtualizer(computed(() => ({
    count: viewMode.value === 'grid' ? rowCount.value : sortedItems.value.length,
    // eslint-disable-next-line unicorn/no-null
    getScrollElement: () => toValue(options.viewportElement) ?? null,
    estimateSize: () => viewMode.value === 'grid'
      ? toValue(options.gridItemHeight)
      : toValue(options.listItemHeight),
    overscan: 5,
    getItemKey: index => viewMode.value === 'grid'
      ? index
      : sortedItems.value[index]?.path ?? index,
    enabled: true,
  })))

  const virtualRows = computed<FileViewerVirtualRow[]>(() =>
    rowVirtualizer.value.getVirtualItems().map(item => ({
      key: item.key,
      index: item.index,
      size: item.size,
      start: item.start,
    })),
  )
  const totalSize = computed(() => rowVirtualizer.value.getTotalSize())

  function getGridRowItems(rowIndex: number): FileViewerItem[] {
    const start = rowIndex * gridCols.value
    const end = (rowIndex + 1) * gridCols.value
    return sortedItems.value.slice(start, end)
  }

  function getListItem(index: number): FileViewerItem {
    return sortedItems.value[Math.min(Math.max(index, 0), sortedItems.value.length - 1)] ?? EMPTY_LIST_ITEM
  }

  function scrollToIndex(index: number) {
    if (sortedItems.value.length === 0) {
      return
    }

    const safeIndex = Math.min(Math.max(index, 0), sortedItems.value.length - 1)
    if (viewMode.value === 'grid') {
      const rowIndex = Math.floor(safeIndex / gridCols.value)
      rowVirtualizer.value.scrollToIndex(rowIndex)
      return
    }

    rowVirtualizer.value.scrollToIndex(safeIndex)
  }

  function measure() {
    rowVirtualizer.value.measure()
  }

  return {
    rowCount,
    showListHeader,
    rowVirtualizer,
    virtualRows,
    totalSize,
    getGridRowItems,
    getListItem,
    scrollToIndex,
    measure,
  }
}
