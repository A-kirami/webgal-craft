/* eslint-disable unicorn/no-null -- 拖拽会话契约显式使用 null 表示无值 */
import type { Ref } from 'vue'
import type { DragMode, DragPayload, DragPosition } from '~/types/drag-drop'

export interface DragSessionState {
  currentDropTarget: HTMLElement | null
  currentPosition: DragPosition | null
  isActive: boolean
  mode: DragMode | null
  payload: DragPayload | null
  startPosition: DragPosition | null
}

export interface UseDragSessionReturn {
  cancel: () => void
  end: () => void
  start: (mode: DragMode, payload: DragPayload, position: DragPosition) => void
  state: Readonly<Ref<DragSessionState>>
  updateDropTarget: (target: HTMLElement | null) => void
  updatePosition: (position: DragPosition) => void
}

function createInitialState(): DragSessionState {
  return {
    currentDropTarget: null,
    currentPosition: null,
    isActive: false,
    mode: null,
    payload: null,
    startPosition: null,
  }
}

const dragSessionState = shallowRef<DragSessionState>(createInitialState())
const readonlyDragSessionState = dragSessionState as Readonly<Ref<DragSessionState>>

function resetState() {
  dragSessionState.value = createInitialState()
}

function start(mode: DragMode, payload: DragPayload, position: DragPosition) {
  dragSessionState.value = {
    currentDropTarget: null,
    currentPosition: { ...position },
    isActive: true,
    mode,
    payload,
    startPosition: { ...position },
  }
}

function updatePosition(position: DragPosition) {
  const state = dragSessionState.value
  if (!state.isActive) {
    return
  }

  dragSessionState.value = {
    ...state,
    currentPosition: { ...position },
  }
}

function updateDropTarget(target: HTMLElement | null) {
  const state = dragSessionState.value
  if (!state.isActive) {
    return
  }

  dragSessionState.value = {
    ...state,
    currentDropTarget: target,
  }
}

function end() {
  resetState()
}

function cancel() {
  resetState()
}

export function useDragSession(): UseDragSessionReturn {
  return {
    cancel,
    end,
    start,
    state: readonlyDragSessionState,
    updateDropTarget,
    updatePosition,
  }
}
