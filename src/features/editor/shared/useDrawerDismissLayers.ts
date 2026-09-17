import { computed, nextTick, toValue, watch } from 'vue'

import type { MaybeRefOrGetter } from 'vue'

/** 遮罩从标题/标签栏下方开始，避免抽屉打开时挡住编辑器顶部的标签与工具条 */
const DRAWER_DISMISS_TOP_OFFSET = 28

export interface DrawerDismissLayer {
  key: string
  style: Record<string, string>
}

interface DrawerDismissSegment extends DrawerDismissLayer {
  height: number
  width: number
}

interface DrawerInteractiveBounds {
  bottom: number
  left: number
  right: number
  top: number
}

interface UseDrawerDismissLayersOptions {
  isOpen: MaybeRefOrGetter<boolean>
  /**
   * 该抽屉打开时需要保持可交互的区域选择器。省略时整窗都是关闭区域，
   * 用于编辑面不在预览区、点预览就应当等同于点抽屉外的抽屉。
   */
  interactiveRegionSelector?: MaybeRefOrGetter<string | undefined>
}

/**
 * 计算非模态抽屉的关闭遮罩分段。
 *
 * 遮罩铺满窗口，但把可交互区域的矩形挖空，使预览等编辑面在抽屉打开时仍可操作；
 * 区域越界或零尺寸时退化为整窗遮罩，避免生成没有可点面积的分段。
 */
export function useDrawerDismissLayers(options: UseDrawerDismissLayersOptions) {
  let interactiveRegion = $ref<HTMLElement>()
  let interactiveRect = $ref<DOMRectReadOnly>()

  function resolveInteractiveBounds(
    rect: DOMRectReadOnly | undefined,
  ): DrawerInteractiveBounds | undefined {
    if (!rect) {
      return undefined
    }

    const bounds = {
      bottom: Math.min(globalThis.innerHeight, rect.bottom),
      left: Math.max(0, rect.left),
      right: Math.min(globalThis.innerWidth, rect.right),
      top: Math.max(DRAWER_DISMISS_TOP_OFFSET, rect.top),
    }

    return bounds.right > bounds.left && bounds.bottom > bounds.top
      ? bounds
      : undefined
  }

  function updateInteractiveRegion(): void {
    const selector = toValue(options.interactiveRegionSelector)
    if (selector === undefined || !toValue(options.isOpen)) {
      interactiveRegion = undefined
      interactiveRect = undefined
      return
    }

    const region = document.querySelector<HTMLElement>(selector) ?? undefined
    interactiveRegion = region
    interactiveRect = region?.getBoundingClientRect()
  }

  useEventListener(globalThis, 'resize', updateInteractiveRegion)
  useResizeObserver(() => interactiveRegion, updateInteractiveRegion)

  watch(
    [() => toValue(options.isOpen), () => toValue(options.interactiveRegionSelector)],
    async ([isOpen]) => {
      if (!isOpen) {
        updateInteractiveRegion()
        return
      }

      await nextTick()
      updateInteractiveRegion()
    },
    { flush: 'post', immediate: true },
  )

  return computed<DrawerDismissLayer[]>(() => {
    if (!toValue(options.isOpen)) {
      return []
    }

    const bounds = resolveInteractiveBounds(interactiveRect)
    if (!bounds) {
      return [{
        key: 'full',
        style: {
          inset: `${DRAWER_DISMISS_TOP_OFFSET}px 0 0 0`,
        },
      }]
    }

    const { bottom, left, right, top } = bounds
    const segments: DrawerDismissSegment[] = [
      {
        height: top - DRAWER_DISMISS_TOP_OFFSET,
        key: 'top',
        style: {
          height: `${top - DRAWER_DISMISS_TOP_OFFSET}px`,
          insetInline: '0',
          top: `${DRAWER_DISMISS_TOP_OFFSET}px`,
        },
        width: globalThis.innerWidth,
      },
      {
        height: bottom - top,
        key: 'left',
        style: {
          height: `${bottom - top}px`,
          left: '0',
          top: `${top}px`,
          width: `${left}px`,
        },
        width: left,
      },
      {
        height: bottom - top,
        key: 'right',
        style: {
          height: `${bottom - top}px`,
          left: `${right}px`,
          right: '0',
          top: `${top}px`,
        },
        width: globalThis.innerWidth - right,
      },
      {
        height: globalThis.innerHeight - bottom,
        key: 'bottom',
        style: {
          bottom: '0',
          insetInline: '0',
          top: `${bottom}px`,
        },
        width: globalThis.innerWidth,
      },
    ]

    // 区域贴边时会剩下零尺寸分段，没有可点面积，直接丢掉
    return segments.filter(segment => segment.height > 0 && segment.width > 0)
  })
}
