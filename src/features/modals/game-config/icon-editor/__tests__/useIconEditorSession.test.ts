import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

import { AbsPath } from '~/domain/path'

import { useIconEditorSession } from '../useIconEditorSession'

const { handleErrorMock, loadIconEditorSourceDataMock } = vi.hoisted(() => ({
  handleErrorMock: vi.fn(),
  loadIconEditorSourceDataMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn(),
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    refreshRegisteredGameSnapshot: vi.fn(),
  },
}))

vi.mock('~/utils/error-handler', () => ({
  handleError: handleErrorMock,
}))

vi.mock('../icon-editor-export', () => ({
  buildIconExportOutputs: vi.fn(),
  saveIconEditorOutputs: vi.fn(),
}))

vi.mock('../icon-editor-source', () => ({
  loadIconEditorSourceData: loadIconEditorSourceDataMock,
}))

async function flushRestoreTasks() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
}

describe('useIconEditorSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('恢复源数据失败时会回退到默认状态并收敛错误', async () => {
    const restoreError = new Error('corrupted icon source')
    loadIconEditorSourceDataMock.mockRejectedValue(restoreError)

    const scope = effectScope()
    const open = ref(true)
    const gamePath = ref(AbsPath.from('/games/demo'))
    const session = scope.run(() => useIconEditorSession({
      gamePath,
      open,
      t: key => key,
    }))

    await flushRestoreTasks()

    expect(session).toBeDefined()
    if (!session) {
      throw new Error('useIconEditorSession 未返回会话')
    }

    expect(handleErrorMock).toHaveBeenCalledWith(restoreError)
    expect(session.state.value.foregroundImage).toBeUndefined()
    expect(session.state.value.backgroundImage).toBeUndefined()
    expect(session.isSaving.value).toBe(false)

    scope.stop()
  })
})
