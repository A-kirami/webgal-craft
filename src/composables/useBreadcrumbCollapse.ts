export interface UseBreadcrumbCollapseOptions {
  containerRef: Ref<HTMLElement | undefined>
  maxVisibleMiddleCount: Ref<number>
  candidateWidths: Ref<number[]>
}

export interface UseBreadcrumbCollapseReturn {
  visibleMiddleCount: Ref<number>
  recalculate: () => void
}

export function useBreadcrumbCollapse(options: UseBreadcrumbCollapseOptions): UseBreadcrumbCollapseReturn {
  const { containerRef, maxVisibleMiddleCount, candidateWidths } = options
  const visibleMiddleCount = ref(maxVisibleMiddleCount.value)
  const containerWidth = ref(0)

  function recalculate() {
    const maxCount = Math.max(0, maxVisibleMiddleCount.value)
    const widths = candidateWidths.value

    if (widths.length === 0 || containerWidth.value <= 0) {
      visibleMiddleCount.value = maxCount
      return
    }

    for (let count = maxCount; count >= 0; count -= 1) {
      const width = widths[count]
      if (typeof width === 'number' && width <= containerWidth.value) {
        visibleMiddleCount.value = count
        return
      }
    }

    visibleMiddleCount.value = 0
  }

  useResizeObserver(containerRef, (entries) => {
    const entry = entries[0]
    containerWidth.value = entry?.contentRect.width ?? 0
    recalculate()
  })

  watch(
    [
      () => maxVisibleMiddleCount.value,
      () => candidateWidths.value.join('|'),
    ],
    recalculate,
    { immediate: true, flush: 'post' },
  )

  return {
    visibleMiddleCount,
    recalculate,
  }
}
