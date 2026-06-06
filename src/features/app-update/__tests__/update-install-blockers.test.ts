import '~/__tests__/setup'

import { describe, expect, it, vi } from 'vitest'

import { hasUpdateInstallBlockers } from '~/features/app-update/update-install-blockers'

const { useEditorStoreMock, useRuntimeTaskStoreMock } = vi.hoisted(() => ({
  useEditorStoreMock: vi.fn(),
  useRuntimeTaskStoreMock: vi.fn(),
}))

vi.mock('~/stores/editor', () => ({
  useEditorStore: useEditorStoreMock,
}))

vi.mock('~/stores/runtime-task', () => ({
  useRuntimeTaskStore: useRuntimeTaskStoreMock,
}))

describe('hasUpdateInstallBlockers', () => {
  it('存在未保存文档或不可中断后台任务时返回 true', () => {
    useEditorStoreMock.mockReturnValue({
      hasUnsavedDocuments: true,
    })
    useRuntimeTaskStoreMock.mockReturnValue({
      hasBlockingTasks: true,
    })

    expect(hasUpdateInstallBlockers()).toBe(true)
  })

  it('没有未保存文档或后台任务时返回 false', () => {
    useEditorStoreMock.mockReturnValue({
      hasUnsavedDocuments: false,
    })
    useRuntimeTaskStoreMock.mockReturnValue({
      hasBlockingTasks: false,
    })

    expect(hasUpdateInstallBlockers()).toBe(false)
  })
})
