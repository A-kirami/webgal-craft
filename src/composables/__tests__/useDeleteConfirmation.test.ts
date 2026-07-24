import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, unref } from 'vue'

import { useDeleteConfirmation } from '../useDeleteConfirmation'

import type { ModelRef } from 'vue'

const { loggerErrorMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  attachConsole: vi.fn(),
  debug: vi.fn(),
  error: loggerErrorMock,
  info: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}))

async function flushDeleteCheck() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('useDeleteConfirmation', () => {
  beforeEach(() => {
    loggerErrorMock.mockReset()
    toastErrorMock.mockReset()
    toastSuccessMock.mockReset()
  })

  it('删除检查失败后会阻止确认删除', async () => {
    const open = ref(true) as ModelRef<boolean | undefined>
    const performDelete = vi.fn(() => Promise.resolve())
    let deleteConfirmation: ReturnType<typeof useDeleteConfirmation> | undefined
    const scope = effectScope()

    scope.run(() => {
      deleteConfirmation = useDeleteConfirmation({
        open,
        identifier: () => 'template-1',
        checkDelete: vi.fn(async () => {
          throw new Error('check failed')
        }),
        performDelete,
        fallbackErrorMessage: () => 'delete failed',
        logPrefix: '删除检查失败',
        deleteLogPrefix: '执行删除失败',
      })
    })

    await flushDeleteCheck()
    unref(deleteConfirmation?.handleConfirm)?.()

    expect(unref(deleteConfirmation?.isConfirmDisabled)).toBe(true)
    expect(performDelete).not.toHaveBeenCalled()
    expect(loggerErrorMock).toHaveBeenCalledWith('删除检查失败: Error: check failed')

    scope.stop()
  })

  it('删除成功后关闭对话框且不弹成功提示', async () => {
    const open = ref(true) as ModelRef<boolean | undefined>
    const performDelete = vi.fn(() => Promise.resolve())
    let deleteConfirmation: ReturnType<typeof useDeleteConfirmation> | undefined
    const scope = effectScope()

    scope.run(() => {
      deleteConfirmation = useDeleteConfirmation({
        open,
        identifier: () => 'template-1',
        checkDelete: vi.fn(async () => ({ canDelete: true })),
        performDelete,
        fallbackErrorMessage: () => 'delete failed',
        logPrefix: '删除检查失败',
        deleteLogPrefix: '执行删除失败',
      })
    })

    await flushDeleteCheck()
    unref(deleteConfirmation?.handleConfirm)?.()
    await Promise.resolve()
    await nextTick()

    expect(performDelete).toHaveBeenCalledTimes(1)
    expect(open.value).toBe(false)
    expect(toastSuccessMock).not.toHaveBeenCalled()

    scope.stop()
  })

  it.each([
    { rejection: new Error('permission denied'), title: '记录 Error 原因' },
    { rejection: 'unknown failure', title: '记录非 Error 原因' },
  ])('实际删除失败时$title并展示兜底文案', async ({ rejection }) => {
    const open = ref(true) as ModelRef<boolean | undefined>
    const performDelete = vi.fn(() => Promise.reject(rejection))
    let deleteConfirmation: ReturnType<typeof useDeleteConfirmation> | undefined
    const scope = effectScope()

    scope.run(() => {
      deleteConfirmation = useDeleteConfirmation({
        open,
        identifier: () => 'template-1',
        checkDelete: vi.fn(async () => ({ canDelete: true })),
        performDelete,
        fallbackErrorMessage: () => 'delete failed',
        logPrefix: '删除检查失败',
        deleteLogPrefix: '执行删除失败',
      })
    })

    await flushDeleteCheck()
    unref(deleteConfirmation?.handleConfirm)?.()

    await vi.waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('delete failed')
    })
    expect(loggerErrorMock).toHaveBeenCalledWith(`执行删除失败: ${rejection}`)
    expect(open.value).toBe(true)
    expect(toastSuccessMock).not.toHaveBeenCalled()

    scope.stop()
  })
})
