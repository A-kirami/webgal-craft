export interface UseColorCommitOptions {
  /** 写入上层模型（由调用方决定事件与格式） */
  commit: (value: string) => void
  /** 读取当前颜色值；与基线比较，相同则不写入 */
  readValue: () => string
  /**
   * 拖拽中的实时值，每帧最多一次。
   *
   * 上层对一次写入的代价差别很大：语句编辑器要重建语句与重渲染（十几到几十毫秒，
   * 每帧写一次会重新把手柄拖住），效果编辑器只改草稿并把预览合并到帧边界（很便宜，
   * 和它的滑条一样应当实时）。所以实时流单独成一条通道，由消费者自己决定要不要接。
   * 不传时就只保留交互结束的那一次权威写入。
   */
  preview?: (value: string) => void
}

/**
 * 颜色选择器的提交节奏：面板内的指针拖拽期间不写模型，指针释放后写入一次。
 *
 * 色板与滑条按每个 pointermove 发 `update:color`，逐次写入模型会让上层（语句事务、编辑器重渲染、
 * 预览重算）按指针频率重跑，拖拽中的手柄绘制被这些同步工作拖住。把一次拖拽收敛成一次提交后，
 * 拖拽期间主线程只需处理指针位置与手柄重绘。
 *
 * 离散来源不经过拖拽：面板内的色值与通道字段、最近使用色块、方向键调整，以及触发器上的字段
 * （它们在面板之外）都逐次提交——这些来源不会产生指针频率的事件流。
 */
export function useColorCommit(options: UseColorCommitOptions) {
  let baseline = options.readValue()
  let interacting = false
  let frameId: number | undefined

  function cancelScheduledFrame() {
    if (frameId === undefined) {
      return
    }

    cancelAnimationFrame(frameId)
    frameId = undefined
  }

  function commitPending() {
    const value = options.readValue()
    if (value === baseline) {
      return
    }

    baseline = value
    options.commit(value)
  }

  function endInteraction() {
    if (!interacting) {
      return
    }

    interacting = false
    globalThis.removeEventListener('pointerup', endInteraction)
    globalThis.removeEventListener('pointercancel', endInteraction)
    cancelScheduledFrame()
    commitPending()
  }

  function beginInteraction(event: PointerEvent) {
    // 只跟踪主键拖拽；右键等不影响提交时机
    if (interacting || event.button !== 0) {
      return
    }

    interacting = true
    // 释放可能落在窗口外：停掉拖拽的判定不能只依赖元素上收到的 pointerup，否则提交会一直挂起
    globalThis.addEventListener('pointerup', endInteraction)
    globalThis.addEventListener('pointercancel', endInteraction)
  }

  function handleChange() {
    if (!interacting) {
      commitPending()
      return
    }

    if (!options.preview || frameId !== undefined) {
      return
    }

    frameId = requestAnimationFrame(() => {
      frameId = undefined
      options.preview?.(options.readValue())
    })
  }

  /** 外部模型变化后重置基线：此后与外部值相同的颜色不再重复写入 */
  function setBaseline(value: string) {
    baseline = value
  }

  // 拖拽中卸载（例如 Esc 关闭面板）视为取消：丢弃未提交的中间值
  tryOnUnmounted(() => {
    interacting = false
    cancelScheduledFrame()
    globalThis.removeEventListener('pointerup', endInteraction)
    globalThis.removeEventListener('pointercancel', endInteraction)
  })

  return {
    beginInteraction,
    handleChange,
    setBaseline,
  }
}
