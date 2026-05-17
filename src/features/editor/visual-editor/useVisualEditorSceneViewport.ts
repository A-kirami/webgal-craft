import { useVirtualizer } from '@tanstack/vue-virtual'

import { SceneVisualProjectionState } from '~/stores/editor'

import type { DragSortVirtualAdapter } from '~/composables/useDragSort'

const ESTIMATED_STATEMENT_ROW_SIZE = 100

interface UseVisualEditorSceneViewportOptions {
  getScrollArea: () => InstanceType<typeof ScrollArea> | null | undefined
  getSelectedIndex: () => number
  getState: () => SceneVisualProjectionState
  restoreSelection: () => void
}

export function useVisualEditorSceneViewport(options: UseVisualEditorSceneViewportOptions) {
  const state = computed(() => options.getState())

  const rowVirtualizer = useVirtualizer(
    computed(() => ({
      count: state.value.statements.length,
      // eslint-disable-next-line unicorn/no-null
      getScrollElement: () => options.getScrollArea()?.viewport?.viewportElement ?? null,
      estimateSize: () => ESTIMATED_STATEMENT_ROW_SIZE,
      overscan: 5,
      paddingStart: 8,
      paddingEnd: 8,
      getItemKey: (index: number) => state.value.statements[index]?.id ?? index,
    })),
  )

  const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
  const totalSize = computed(() => rowVirtualizer.value.getTotalSize())
  const isPositioning = ref(false)

  function measureVisibleStatementRows() {
    const viewportElement = options.getScrollArea()?.viewport?.viewportElement
    if (!viewportElement) {
      return
    }

    for (const element of viewportElement.querySelectorAll<HTMLElement>('[data-index]')) {
      rowVirtualizer.value.measureElement(element)
    }
  }

  const statementSortVirtualAdapter: DragSortVirtualAdapter = {
    getEstimatedItemSize: () => ESTIMATED_STATEMENT_ROW_SIZE,
    getItemCount: () => state.value.statements.length,
    getScrollOffset: () => rowVirtualizer.value.scrollOffset ?? 0,
    getVisibleItems: () => rowVirtualizer.value.getVirtualItems().map(item => ({
      index: item.index,
      size: item.size,
      start: item.start,
    })),
    invalidate: measureVisibleStatementRows,
  }
  let scrollRequestId = 0

  function scrollToSelectedStatement(
    align: 'center' | 'auto' = 'center',
    options_: {
      trackPositioning?: boolean
    } = {},
  ): Promise<void> {
    const index = options.getSelectedIndex()
    if (index === -1) {
      return Promise.resolve()
    }

    const currentRequestId = ++scrollRequestId
    const trackPositioning = options_.trackPositioning ?? false
    if (trackPositioning) {
      isPositioning.value = true
    }

    return new Promise((resolve) => {
      let lastOffset = -1
      let stableFrames = 0
      let remainingFrames = 10

      function finish() {
        if (trackPositioning && currentRequestId === scrollRequestId) {
          isPositioning.value = false
        }
        resolve()
      }

      function settle() {
        if (currentRequestId !== scrollRequestId) {
          if (trackPositioning) {
            isPositioning.value = false
          }
          resolve()
          return
        }

        remainingFrames--
        rowVirtualizer.value.scrollToIndex(index, { align })
        const offset = rowVirtualizer.value.scrollOffset ?? 0
        if (Math.abs(offset - lastOffset) <= 1) {
          stableFrames++
        } else {
          stableFrames = 0
        }
        lastOffset = offset

        if (stableFrames >= 2 || remainingFrames <= 0) {
          finish()
          return
        }

        requestAnimationFrame(settle)
      }

      settle()
    })
  }

  async function restoreSelectionAndScroll() {
    options.restoreSelection()
    rowVirtualizer.value.measure()
    await nextTick()
    await scrollToSelectedStatement('center', { trackPositioning: true })
  }

  function measureRowElement(element: Element | ComponentPublicInstance | null) {
    if (element instanceof Element) {
      rowVirtualizer.value.measureElement(element)
    }
  }

  onMounted(() => {
    void restoreSelectionAndScroll()
  })

  watch(() => state.value.path, () => {
    void restoreSelectionAndScroll()
  })

  return {
    isPositioning,
    measureRowElement,
    restoreSelectionAndScroll,
    scrollToSelectedStatement,
    statementSortVirtualAdapter,
    totalSize,
    virtualRows,
  }
}
