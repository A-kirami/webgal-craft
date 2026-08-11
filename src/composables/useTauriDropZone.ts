import { getCurrentWebview } from '@tauri-apps/api/webview'

import type { PhysicalPosition } from '@tauri-apps/api/dpi'
import type { DragDropEvent } from '@tauri-apps/api/webview'

export interface UseTauriDropZoneOptions {
  /**
   * 文件进入拖放区域时的回调函数
   */
  onEnter?: (files: string[]) => void
  /**
   * 文件在拖放区域上方时的回调函数
   */
  onOver?: () => void
  /**
   * 文件拖放时的回调函数
   */
  onDrop?: (files: string[]) => void
  /**
   * 文件离开拖放区域时的回调函数
   */
  onLeave?: () => void
}

export interface UseTauriDropZoneReturn {
  /**
   * 当前拖放的文件路径列表
   */
  files: Ref<string[] | undefined>
  /**
   * 是否在拖放区域上方
   */
  isOverDropZone: Ref<boolean>
  /**
   * 当前原生拖拽坐标命中的最深层 DOM 元素
   */
  targetElement: Ref<Element | undefined>
}

export function useTauriDropZone(
  target: MaybeRefOrGetter<HTMLElement | Document | null | undefined>,
  options: UseTauriDropZoneOptions | UseTauriDropZoneOptions['onDrop'] = {},
): UseTauriDropZoneReturn {
  const isOverDropZone = ref(false)
  const files = ref<string[] | undefined>(undefined)
  const targetElement = shallowRef<Element>()
  let dragPaths: string[] | undefined
  let unlisten: (() => void) | undefined

  // 处理简化的参数形式
  const normalizedOptions: UseTauriDropZoneOptions = typeof options === 'function'
    ? { onDrop: options }
    : options

  function isElementInTarget(element: Element | null): boolean {
    const targetElement = toValue(target)
    if (!element || !targetElement) {
      return false
    }
    return targetElement.contains(element)
  }

  function updateDropZoneState(element: Element | null, paths?: string[]): void {
    const wasOverDropZone = isOverDropZone.value
    const isOverTarget = isElementInTarget(element)

    if (isOverTarget && !wasOverDropZone) {
      isOverDropZone.value = true
      targetElement.value = element ?? undefined
      normalizedOptions.onEnter?.(paths ?? dragPaths ?? [])
    } else if (!isOverTarget && wasOverDropZone) {
      isOverDropZone.value = false
      targetElement.value = undefined
      normalizedOptions.onLeave?.()
    } else if (isOverTarget && wasOverDropZone) {
      targetElement.value = element ?? undefined
      normalizedOptions.onOver?.()
    }
  }

  function elementAtPosition(position: PhysicalPosition): Element | null {
    const logicalPosition = position.toLogical(globalThis.devicePixelRatio || 1)
    return document.elementFromPoint(logicalPosition.x, logicalPosition.y)
  }

  function handleDragDropEvent(payload: DragDropEvent): void {
    switch (payload.type) {
      case 'enter': {
        dragPaths = payload.paths
        files.value = payload.paths
        if (payload.position) {
          updateDropZoneState(elementAtPosition(payload.position), payload.paths)
        }
        break
      }

      case 'over': {
        if (payload.position) {
          updateDropZoneState(elementAtPosition(payload.position), dragPaths)
        }
        break
      }

      case 'drop': {
        let handledDrop = false
        if (payload.position) {
          const element = elementAtPosition(payload.position)
          if (isElementInTarget(element) && payload.paths) {
            targetElement.value = element ?? undefined
            files.value = payload.paths
            normalizedOptions.onDrop?.(payload.paths)
            handledDrop = true
          }
        }
        isOverDropZone.value = false
        targetElement.value = undefined
        dragPaths = undefined
        if (!handledDrop) {
          normalizedOptions.onLeave?.()
        }
        break
      }

      case 'leave': {
        isOverDropZone.value = false
        targetElement.value = undefined
        dragPaths = undefined
        normalizedOptions.onLeave?.()
        break
      }

      // no default
    }
  }

  tryOnMounted(async () => {
    const webview = getCurrentWebview()
    unlisten = await webview.onDragDropEvent((event) => {
      handleDragDropEvent(event.payload)
    })
  })

  tryOnUnmounted(() => unlisten?.())

  return {
    files,
    isOverDropZone,
    targetElement,
  }
}
