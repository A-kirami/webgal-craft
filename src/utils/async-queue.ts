export interface AsyncQueue {
  /** 入队一次消费请求。如果队列空闲则立即启动消费循环。 */
  enqueue(): void
  /** 入队并等待当前消费循环完成。 */
  flush(): Promise<void>
  /** 取消待处理的消费请求（不中断正在执行的任务）。 */
  cancel(): void
}

/**
 * 创建一个单例异步队列。
 *
 * 队列保证同一时刻只有一个 consumer 在执行。
 * 如果在 consumer 执行期间有新的 enqueue 调用，
 * consumer 完成后会自动再次执行（合并多次 enqueue 为一次消费）。
 *
 * @param consumer 消费函数，每次出队时调用
 * @param canRun 可选的前置条件检查，返回 false 时跳过消费
 */
export function createAsyncQueue(
  consumer: () => Promise<void>,
  canRun?: () => boolean,
): AsyncQueue {
  let queued = false
  let task: Promise<void> | undefined

  async function consume() {
    while (queued && (!canRun || canRun())) {
      queued = false
      // eslint-disable-next-line no-await-in-loop -- 队列逐个串行消费，await 是有意为之
      await consumer()
    }
    queued = false
  }

  function run(): Promise<void> {
    if (task) {
      return task
    }

    task = (async () => {
      try {
        await consume()
      } finally {
        task = undefined
      }
    })()

    return task
  }

  function enqueue() {
    if (canRun && !canRun()) {
      return
    }
    queued = true
    void run()
  }

  async function flush() {
    if (canRun && !canRun()) {
      return
    }
    // 如果已有 task 在执行，等待它完成；期间可能有新的 enqueue，循环排空
    while (task) {
      // eslint-disable-next-line no-await-in-loop -- 循环排空队列，串行等待是有意为之
      await task
      if (!queued) {
        return
      }
    }
    queued = true
    await run()
  }

  function cancel() {
    queued = false
  }

  return { enqueue, flush, cancel }
}
