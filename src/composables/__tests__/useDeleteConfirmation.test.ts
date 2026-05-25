import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref, unref } from 'vue'

import { useDeleteConfirmation } from '../useDeleteConfirmation'

import type { ModelRef } from 'vue'

const { loggerErrorMock, notifyErrorMock, notifySuccessMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifySuccessMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  attachConsole: vi.fn(),
  debug: vi.fn(),
  error: loggerErrorMock,
  info: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('notivue', () => ({
  push: {
    error: notifyErrorMock,
    success: notifySuccessMock,
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
    notifyErrorMock.mockReset()
    notifySuccessMock.mockReset()
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
        successMessage: () => 'deleted',
        fallbackErrorMessage: () => 'delete failed',
        logPrefix: '删除检查失败',
      })
    })

    await flushDeleteCheck()
    unref(deleteConfirmation?.handleConfirm)?.()

    expect(unref(deleteConfirmation?.isConfirmDisabled)).toBe(true)
    expect(performDelete).not.toHaveBeenCalled()
    expect(loggerErrorMock).toHaveBeenCalledWith('删除检查失败: Error: check failed')

    scope.stop()
  })
})
