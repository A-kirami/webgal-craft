import { getCurrentWebview } from '@tauri-apps/api/webview'

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
}

export function useTauriDropZone(
  target: MaybeRefOrGetter<HTMLElement | Document | null | undefined>,
  options: UseTauriDropZoneOptions | UseTauriDropZoneOptions['onDrop'] = {},
): UseTauriDropZoneReturn {
  const isOverDropZone = ref(false)
  const files = ref<string[] | undefined>(undefined)
  let counter = 0
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
      counter += 1
      isOverDropZone.value = true
      if (paths) {
        normalizedOptions.onEnter?.(paths)
      }
    } else if (!isOverTarget && wasOverDropZone) {
      counter = Math.max(0, counter - 1)
      if (counter === 0) {
        isOverDropZone.value = false
      }
      normalizedOptions.onLeave?.()
    } else if (isOverTarget && wasOverDropZone) {
      normalizedOptions.onOver?.()
    }
  }

  function elementAtPosition(position: { x: number, y: number }): Element | null {
    return document.elementFromPoint(position.x, position.y)
  }

  function handleDragDropEvent(payload: DragDropEvent): void {
    switch (payload.type) {
      case 'enter': {
        if (payload.position) {
          updateDropZoneState(elementAtPosition(payload.position), payload.paths)
        }
        break
      }

      case 'over': {
        if (payload.position) {
          updateDropZoneState(elementAtPosition(payload.position))
        }
        break
      }

      case 'drop': {
        if (payload.position) {
          if (isElementInTarget(elementAtPosition(payload.position)) && payload.paths) {
            files.value = payload.paths
            normalizedOptions.onDrop?.(payload.paths)
          }
          counter = 0
          isOverDropZone.value = false
        }
        break
      }

      case 'leave': {
        counter = Math.max(0, counter - 1)
        if (counter === 0) {
          isOverDropZone.value = false
        }
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
  }
}
