import { describe, expect, it } from 'vitest'

import { createAsyncQueue } from '~/utils/async-queue'

// createAsyncQueue 在 consumer 内部串接的延迟 Promise 需要更多 flushMicrotasks tick 才能推进到下一次消费。
const EXTRA_FLUSH_ITERATIONS = 8

function flushMicrotasks(times: number = 4): Promise<void> {
  if (times <= 0) {
    return Promise.resolve()
  }
  return Promise.resolve().then(() => flushMicrotasks(times - 1))
}

describe('createAsyncQueue 异步队列', () => {
  it('enqueue 触发 consumer 执行', async () => {
    let called = 0
    const queue = createAsyncQueue(async () => {
      called++
    })

    queue.enqueue()
    await flushMicrotasks()

    expect(called).toBe(1)
  })

  it('多次 enqueue 合并为一次消费', async () => {
    let called = 0
    let resolver: (() => void) | undefined

    const queue = createAsyncQueue(async () => {
      called++
      await new Promise<void>((resolve) => {
        resolver = resolve
      })
    })

    queue.enqueue()
    await flushMicrotasks()
    expect(called).toBe(1)

    // consumer 执行期间多次 enqueue，只应触发一次后续消费
    queue.enqueue()
    queue.enqueue()
    queue.enqueue()

    resolver!()
    await flushMicrotasks(EXTRA_FLUSH_ITERATIONS)

    expect(called).toBe(2)
  })

  it('canRun 返回 false 时不执行 consumer', async () => {
    let called = 0
    let allowed = false

    const queue = createAsyncQueue(
      async () => {
        called++
      },
      () => allowed,
    )

    queue.enqueue()
    await flushMicrotasks()
    expect(called).toBe(0)

    allowed = true
    queue.enqueue()
    await flushMicrotasks()
    expect(called).toBe(1)
  })

  it('cancel 取消待处理的消费', async () => {
    let called = 0
    let resolver: (() => void) | undefined

    const queue = createAsyncQueue(async () => {
      called++
      await new Promise<void>((resolve) => {
        resolver = resolve
      })
    })

    queue.enqueue()
    await flushMicrotasks()
    expect(called).toBe(1)

    queue.enqueue()
    queue.cancel()

    resolver!()
    await flushMicrotasks(EXTRA_FLUSH_ITERATIONS)

    // cancel 应阻止后续消费
    expect(called).toBe(1)
  })

  it('flush 等待消费完成', async () => {
    let called = 0
    let resolver: (() => void) | undefined

    const queue = createAsyncQueue(async () => {
      called++
      await new Promise<void>((resolve) => {
        resolver = resolve
      })
    })

    const flushPromise = queue.flush()
    await flushMicrotasks()
    expect(called).toBe(1)

    resolver!()
    await flushPromise

    expect(called).toBe(1)
  })

  it('flush 在消费完成后如果有新 enqueue 会递归消费', async () => {
    let called = 0
    const resolvers: (() => void)[] = []

    const queue = createAsyncQueue(async () => {
      called++
      await new Promise<void>((resolve) => {
        resolvers.push(resolve)
      })
    })

    const flushPromise = queue.flush()
    await flushMicrotasks()
    expect(called).toBe(1)

    // 在 consumer 执行期间再次 enqueue
    queue.enqueue()

    resolvers[0]!()
    await flushMicrotasks(EXTRA_FLUSH_ITERATIONS)
    expect(called).toBe(2)

    resolvers[1]!()
    await flushPromise

    expect(called).toBe(2)
  })

  it('并发 flush 共享同一个 task', async () => {
    let called = 0
    let resolver: (() => void) | undefined

    const queue = createAsyncQueue(async () => {
      called++
      await new Promise<void>((resolve) => {
        resolver = resolve
      })
    })

    const flush1 = queue.flush()
    const flush2 = queue.flush()
    await flushMicrotasks()

    // 两次 flush 应只触发一次 consumer
    expect(called).toBe(1)

    resolver!()
    await Promise.all([flush1, flush2])

    expect(called).toBe(1)
  })

  it('flush 在等待 task 期间有新 enqueue 时继续排空', async () => {
    let called = 0
    const resolvers: (() => void)[] = []

    const queue = createAsyncQueue(async () => {
      called++
      await new Promise<void>((resolve) => {
        resolvers.push(resolve)
      })
    })

    // 先通过 enqueue 启动一次消费
    queue.enqueue()
    await flushMicrotasks()
    expect(called).toBe(1)

    // 在 consumer 执行期间调用 flush（此时 task 存在）
    const flushPromise = queue.flush()

    // 在 flush 等待 task 期间再 enqueue
    queue.enqueue()

    // 完成第一次消费
    resolvers[0]!()
    await flushMicrotasks(EXTRA_FLUSH_ITERATIONS)

    // flush 应检测到 queued 并继续排空，触发第二次消费
    expect(called).toBe(2)

    // 完成第二次消费
    resolvers[1]!()
    await flushPromise

    expect(called).toBe(2)
  })
})
