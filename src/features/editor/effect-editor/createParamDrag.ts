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

  const drag = useImmediatePointerDrag<S & { param: P }>({
    onStart(event) {
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
    onMove: callbacks.onMove,
    onEnd: callbacks.onEnd,
    onCancel: callbacks.onCancel,
  })

  function start(event: PointerEvent, param: P) {
    pendingParam.value = param
    drag.start(event)
  }

  return { drag, start }
}
