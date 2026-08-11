import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'

const { safeInvokeMock } = vi.hoisted(() => ({
  safeInvokeMock: vi.fn(),
}))

vi.mock('~/utils/invoke', () => ({
  safeInvoke: safeInvokeMock,
}))

import { archiveImportCmds } from '../archive-import'

describe('archiveImportCmds', () => {
  beforeEach(() => {
    safeInvokeMock.mockReset()
  })

  it('解包命令转换外部绝对路径并保留服务端会话身份', async () => {
    safeInvokeMock.mockResolvedValue({
      rootPath: String.raw`C:\Temp\archive\payload\WebGAL`,
      sessionId: 'session-1',
    })

    await expect(archiveImportCmds.extract(AbsPath.from(String.raw`C:\Downloads\WebGAL.zip`), 'engine'))
      .resolves.toEqual({
        rootPath: 'C:/Temp/archive/payload/WebGAL',
        sessionId: 'session-1',
      })
    expect(safeInvokeMock).toHaveBeenCalledWith('extract_resource_archive', {
      archivePath: 'C:/Downloads/WebGAL.zip',
      kind: 'engine',
    })
  })

  it('清理命令只接受服务端生成的会话身份', async () => {
    safeInvokeMock.mockResolvedValue(undefined)

    await archiveImportCmds.cleanup('session-1')

    expect(safeInvokeMock).toHaveBeenCalledWith('cleanup_resource_archive', {
      sessionId: 'session-1',
    })
  })
})
