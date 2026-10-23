/**
 * 流程图自动保存控制器。
 *
 * 单个文档只有一条保存链：写入期间的新改动不会并发写盘，而是在本次写入结束后再写一次，
 * 保证落盘顺序与编辑顺序一致；保存失败保留待写入状态，显式 flush 会传播错误。
 */
export interface FlowchartAutoSaveOptions {
  debounceMs: number
  onError: (error: unknown) => void
  save: () => Promise<void>
}

export interface FlowchartAutoSaveController {
  /** 立即执行待写入内容；重复调用等待同一条保存链，失败后可再次调用重试。 */
  flush: () => Promise<void>
  schedule: () => void
}

export function createFlowchartAutoSaveController(
  options: FlowchartAutoSaveOptions,
): FlowchartAutoSaveController {
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> | undefined
  let pending = false

  function clearTimer() {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  async function drain(): Promise<void> {
    try {
      while (pending) {
        pending = false
        // eslint-disable-next-line no-await-in-loop -- 同一文档必须串行写入，不能让旧内容晚于新内容落盘。
        await options.save()
      }
    } catch (error) {
      pending = true
      throw error
    } finally {
      running = undefined
    }
  }

  function schedule() {
    pending = true
    if (running) {
      return
    }

    clearTimer()
    timer = setTimeout(() => {
      void flush().catch(options.onError)
    }, options.debounceMs)
  }

  function flush(): Promise<void> {
    clearTimer()
    if (!running && pending) {
      running = drain()
    }
    return running ?? Promise.resolve()
  }

  return {
    flush,
    schedule,
  }
}
