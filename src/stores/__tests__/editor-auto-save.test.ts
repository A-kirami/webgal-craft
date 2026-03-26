import { beforeEach, describe, expect, it, vi } from 'vitest'

import { canExecuteEditorAutoSave, createEditorAutoSaveController } from '../editor-auto-save'

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve
  })
  return { promise, resolve }
}

describe('编辑器自动保存', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('允许为存在同步错误的文本草稿安排自动保存', () => {
    expect(canExecuteEditorAutoSave({
      isDirty: true,
      projection: 'text',
    })).toBe(true)

    expect(canExecuteEditorAutoSave({
      isDirty: true,
      projection: 'visual',
    })).toBe(true)
  })

  it('同一路径重复调度时只保留最后一个 timer', async () => {
    const saveDocument = vi.fn(async () => undefined)
    const controller = createEditorAutoSaveController({
      debounceMs: 500,
      getState: () => ({
        isDirty: true,
        projection: 'text',
      }),
      handleSaveError: vi.fn(),
      saveDocument,
    })

    vi.useFakeTimers()
    try {
      controller.schedule('/game/docs/example.txt')
      controller.schedule('/game/docs/example.txt')

      expect(controller.hasPending('/game/docs/example.txt')).toBe(true)

      await vi.advanceTimersByTimeAsync(499)
      expect(saveDocument).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(saveDocument).toHaveBeenCalledTimes(1)
      expect(controller.hasPending('/game/docs/example.txt')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('取消后不会再触发保存，保存失败会走统一错误处理', async () => {
    const handleSaveError = vi.fn()
    const saveError = new TypeError('save failed')
    const saveDocument = vi.fn(async () => {
      throw saveError
    })
    const controller = createEditorAutoSaveController({
      debounceMs: 500,
      getState: path => path === '/cancelled'
        ? {
            isDirty: true,
            projection: 'text',
          }
        : {
            isDirty: true,
            projection: 'visual',
          },
      handleSaveError,
      saveDocument,
    })

    vi.useFakeTimers()
    try {
      controller.schedule('/cancelled')
      controller.cancel('/cancelled')
      await vi.advanceTimersByTimeAsync(500)
      expect(saveDocument).not.toHaveBeenCalled()

      controller.schedule('/game/scene.txt')
      await vi.advanceTimersByTimeAsync(500)
      expect(handleSaveError).toHaveBeenCalledWith(saveError)
    } finally {
      vi.useRealTimers()
    }
  })

  it('保存进行中再次调度时会在当前保存结束后补跑一次', async () => {
    const firstSave = createDeferred<void>()
    const secondSave = createDeferred<void>()
    const saveDocument = vi.fn()
      .mockImplementationOnce(async () => firstSave.promise)
      .mockImplementationOnce(async () => secondSave.promise)
    const controller = createEditorAutoSaveController({
      debounceMs: 500,
      getState: () => ({
        isDirty: true,
        projection: 'text',
      }),
      handleSaveError: vi.fn(),
      saveDocument,
    })

    vi.useFakeTimers()
    try {
      controller.schedule('/game/scene.txt')
      await vi.advanceTimersByTimeAsync(500)
      expect(saveDocument).toHaveBeenCalledTimes(1)

      controller.schedule('/game/scene.txt')
      await vi.advanceTimersByTimeAsync(500)
      expect(saveDocument).toHaveBeenCalledTimes(1)

      firstSave.resolve()
      await Promise.resolve()
      await Promise.resolve()

      expect(saveDocument).toHaveBeenCalledTimes(2)

      secondSave.resolve()
      await vi.waitFor(() => {
        expect(controller.hasPending('/game/scene.txt')).toBe(false)
      })
    } finally {
      vi.useRealTimers()
    }
  })
})
