import { usePointerDrag } from '~/composables/usePointerDrag'

/**
 * 工厂函数：封装 pendingParam + usePointerDrag 的"延迟参数传递"模式。
 * 消除 number、dial、color 三个控件中的重复代码。
 */

interface ParamDragCallbacks<P, S> {
  onStart: (event: PointerEvent, param: P) => S | undefined
  onMove: (event: PointerEvent, state: S & { param: P }) => void
  onEnd: (event: PointerEvent | undefined, state: S & { param: P }) => void
}

export function createParamDrag<P, S>(callbacks: ParamDragCallbacks<P, S>) {
  const pendingParam = ref<P>()

  const drag = usePointerDrag<S & { param: P }>({
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
  })

  function start(event: PointerEvent, param: P) {
    pendingParam.value = param
    drag.start(event)
  }

  return { drag, start }
}
