import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createFlowchartAutoSaveController } from '../flowchart-autosave'

describe('createFlowchartAutoSaveController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function createController(save: () => Promise<void>, onError = vi.fn()) {
    return {
      controller: createFlowchartAutoSaveController({ debounceMs: 400, onError, save }),
      onError,
    }
  }

  it('防抖窗口内多次改动只写一次', async () => {
    const save = vi.fn(() => Promise.resolve())
    const { controller } = createController(save)

    controller.schedule()
    controller.schedule()
    await vi.advanceTimersByTimeAsync(399)
    expect(save).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('flush 立即执行待写入内容', async () => {
    const save = vi.fn(() => Promise.resolve())
    const { controller } = createController(save)

    controller.schedule()
    await controller.flush()
    expect(save).toHaveBeenCalledTimes(1)
    await controller.flush()
    await vi.advanceTimersByTimeAsync(400)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('写入期间的新改动在本次写入结束后再写一次', async () => {
    let releaseFirst: (() => void) | undefined
    const save = vi.fn(async () => {
      if (save.mock.calls.length === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve
        })
      }
    })
    const { controller } = createController(save)

    controller.schedule()
    await vi.advanceTimersByTimeAsync(400)
    expect(save).toHaveBeenCalledTimes(1)

    controller.schedule()
    releaseFirst?.()
    await vi.runAllTimersAsync()
    await Promise.resolve()

    expect(save).toHaveBeenCalledTimes(2)
  })

  it('后台保存失败时上报错误，flush 可重试未写入的内容', async () => {
    const failure = new Error('写盘失败')
    const save = vi.fn(() => Promise.resolve())
    save.mockRejectedValueOnce(failure)
    const { controller, onError } = createController(save)

    controller.schedule()
    await vi.advanceTimersByTimeAsync(400)
    expect(onError).toHaveBeenCalledWith(failure)

    await controller.flush()
    expect(save).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('flush 期间的重复调用等待同一轮写入完成', async () => {
    let release: (() => void) | undefined
    const save = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
    })
    const { controller } = createController(save)

    controller.schedule()
    const first = controller.flush()
    const second = controller.flush()
    await Promise.resolve()
    release?.()
    await Promise.all([first, second])

    // 写入期间没有新改动，第二轮不会重复写盘
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('显式 flush 失败时所有等待者都收到错误，重试后才算完成', async () => {
    const failure = new Error('写盘失败')
    let rejectSave!: (error: Error) => void
    const save = vi.fn(() => new Promise<void>((_resolve, reject) => {
      rejectSave = reject
    }))
    const { controller, onError } = createController(save)
    controller.schedule()
    const first = expect(controller.flush()).rejects.toBe(failure)
    const second = expect(controller.flush()).rejects.toBe(failure)
    rejectSave(failure)
    await Promise.all([first, second])
    expect(onError).not.toHaveBeenCalled()

    save.mockResolvedValue(undefined)
    await controller.flush()
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('flush 等待写入期间新增修改的后续写入', async () => {
    const releases: (() => void)[] = []
    const save = vi.fn(() => new Promise<void>((resolve) => {
      releases.push(resolve)
    }))
    const { controller } = createController(save)
    controller.schedule()
    let finished = false
    const flushed = controller.flush().then(() => {
      finished = true
    })
    controller.schedule()
    releases[0]!()
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(finished).toBe(false)
    releases[1]!()
    await flushed
    expect(finished).toBe(true)
  })

  it('上一轮完成同一微任务内发生的新改动仍会自动保存', async () => {
    let finishSave!: () => void
    const save = vi.fn(() => new Promise<void>((resolve) => {
      finishSave = resolve
    }))
    const { controller } = createController(save)
    controller.schedule()
    const first = controller.flush()
    finishSave()
    await Promise.resolve()
    save.mockResolvedValue(undefined)
    controller.schedule()
    await first
    await vi.advanceTimersByTimeAsync(400)
    expect(save).toHaveBeenCalledTimes(2)
  })
})
