import '~/__tests__/setup'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { AbsPath, RelPath } from '~/domain/path'

const { safeInvokeMock } = vi.hoisted(() => ({
  safeInvokeMock: vi.fn(),
}))

vi.mock('~/utils/invoke', () => ({
  safeInvoke: safeInvokeMock,
}))

import { vfsCmds } from '../vfs'

describe('vfsCmds', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('将 resolvePath 返回的物理路径归一化为 AbsPath', async () => {
    safeInvokeMock.mockResolvedValueOnce(String.raw`C:\Project\game\scene\start.txt`)

    await expect(vfsCmds.resolvePath({
      projectPath: AbsPath.from('C:/Project'),
      enginePath: AbsPath.from('C:/Engine'),
      relPath: RelPath.from('game/scene/start.txt'),
    })).resolves.toBe('C:/Project/game/scene/start.txt')
  })

  it('将 renamePath 返回的逻辑路径归一化为 RelPath', async () => {
    safeInvokeMock.mockResolvedValueOnce(String.raw`game\scene\next.txt`)

    await expect(vfsCmds.renamePath({
      projectPath: AbsPath.from('C:/Project'),
      enginePath: AbsPath.from('C:/Engine'),
      relPath: RelPath.from('game/scene/start.txt'),
      newName: 'next.txt',
    })).resolves.toBe('game/scene/next.txt')
  })
})
