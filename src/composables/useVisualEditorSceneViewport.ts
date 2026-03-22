import { useVirtualizer } from '@tanstack/vue-virtual'

import { SceneVisualProjectionState } from '~/stores/editor'

interface UseVisualEditorSceneViewportOptions {
  getActiveProjection: () => 'text' | 'visual' | undefined
  getActiveTabPath: () => string | undefined
  getScrollArea: () => InstanceType<typeof ScrollArea> | null | undefined
  getSelectedIndex: () => number
  getState: () => SceneVisualProjectionState
  restoreSelection: () => void
}

export function useVisualEditorSceneViewport(options: UseVisualEditorSceneViewportOptions) {
  const state = computed(() => options.getState())
  const activeProjection = computed(() => options.getActiveProjection())

  const rowVirtualizer = useVirtualizer(
    computed(() => ({
      count: state.value.statements.length,
      // eslint-disable-next-line unicorn/no-null
      getScrollElement: () => options.getScrollArea()?.viewport?.viewportElement ?? null,
      estimateSize: () => 100,
      overscan: 5,
      paddingStart: 8,
      paddingEnd: 8,
      getItemKey: (index: number) => state.value.statements[index]?.id ?? index,
    })),
  )

  const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
  const totalSize = computed(() => rowVirtualizer.value.getTotalSize())
  const isPositioning = ref(false)
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
  watch(
    [activeProjection, () => options.getActiveTabPath()],
    ([projection, activePath], [previousProjection]) => {
      if (
        projection === 'visual'
        && previousProjection === 'text'
        && activePath === state.value.path
      ) {
        void restoreSelectionAndScroll()
      }
    },
  )

  return {
    isPositioning,
    measureRowElement,
    scrollToSelectedStatement,
    totalSize,
    virtualRows,
  }
}
