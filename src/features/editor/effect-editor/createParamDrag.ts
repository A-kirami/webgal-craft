import { useImmediatePointerDrag } from '~/composables/useImmediatePointerDrag'

import type { ImmediatePointerDragEvent } from '~/composables/useImmediatePointerDrag'

/**
 * 工厂函数：封装 pendingParam + useImmediatePointerDrag 的"延迟参数传递"模式。
 * 消除 number、dial、color 三个控件中的重复代码。
 */

interface ParamDragCallbacks<P, S> {
  onStart: (event: ImmediatePointerDragEvent, param: P) => S | undefined
  onMove: (event: ImmediatePointerDragEvent, state: S & { param: P }) => void
  onEnd: (event: ImmediatePointerDragEvent | undefined, state: S & { param: P }) => void
  onCancel?: (state: S & { param: P }) => void
}

export function createParamDrag<P, S>(callbacks: ParamDragCallbacks<P, S>) {
  const pendingParam = ref<P>()
  // 拖动过就吞掉紧接着的那次点击：label 的点击激活会把焦点送进关联输入框，
  // 而效果编辑器里撤销、复制这类快捷键只在非输入态生效，焦点一进输入框就整片失效
  let suppressNextClick = false

  const drag = useImmediatePointerDrag<S & { param: P }>({
    onStart(event) {
      suppressNextClick = false
      const param = pendingParam.value
      pendingParam.value = undefined
      if (!param) {
        return
      }
      const state = callbacks.onStart(event, param)
      if (!state) {
        return
      }
      return { ...state, param }
    },
    onMove(event, state) {
      suppressNextClick = true
      callbacks.onMove(event, state)
    },
    onEnd: callbacks.onEnd,
    onCancel(state) {
      suppressNextClick = false
      callbacks.onCancel?.(state)
    },
  })

  function start(event: PointerEvent, param: P) {
    pendingParam.value = param
    drag.start(event)
  }

  /** 挂在 label 的 click 上：拖动过就阻止默认的聚焦，纯点击仍保留原生行为 */
  function handleClick(event: MouseEvent): void {
    if (!suppressNextClick) {
      return
    }

    suppressNextClick = false
    event.preventDefault()
  }

  return { drag, handleClick, start }
}
