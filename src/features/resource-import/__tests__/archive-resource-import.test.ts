import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'

const { cleanupMock, extractMock, loggerWarnMock } = vi.hoisted(() => ({
  cleanupMock: vi.fn(),
  extractMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  warn: loggerWarnMock,
}))

vi.mock('~/commands/archive-import', () => ({
  archiveImportCmds: {
    cleanup: cleanupMock,
    extract: extractMock,
  },
}))

import { importResourceArchive, isArchiveImportPath } from '../archive-resource-import'

describe('archiveResourceImport', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    extractMock.mockResolvedValue({
      rootPath: AbsPath.from('/temp/session/payload/engine'),
      sessionId: 'session-1',
    })
    cleanupMock.mockResolvedValue(undefined)
  })

  it.each([
    'engine.zip',
    'engine.tar',
    'engine.tar.gz',
    'engine.tgz',
    'engine.rar',
  ])('将压缩文件 %s 交给归档导入边界', (path) => {
    expect(isArchiveImportPath(path)).toBe(true)
  })

  it('不会把普通目录当成压缩包', () => {
    expect(isArchiveImportPath('/engines/WebGAL')).toBe(false)
  })

  it('解包后导入识别到的资源根目录并清理会话', async () => {
    const importDirectory = vi.fn().mockResolvedValue({ alreadyRegistered: false })

    await expect(importResourceArchive(
      'engine',
      AbsPath.from('/downloads/engine.zip'),
      importDirectory,
    )).resolves.toEqual({ alreadyRegistered: false })

    expect(extractMock).toHaveBeenCalledWith('/downloads/engine.zip', 'engine')
    expect(importDirectory).toHaveBeenCalledWith('/temp/session/payload/engine')
    expect(cleanupMock).toHaveBeenCalledWith('session-1')
  })

  it('目录导入失败时仍清理会话并保留原始错误', async () => {
    const importError = new Error('invalid manifest')
    const importDirectory = vi.fn().mockRejectedValue(importError)

    await expect(importResourceArchive(
      'template',
      AbsPath.from('/downloads/template.tar.gz'),
      importDirectory,
    )).rejects.toBe(importError)

    expect(cleanupMock).toHaveBeenCalledWith('session-1')
  })

  it('清理失败只记录诊断，不会把成功导入改成失败', async () => {
    cleanupMock.mockRejectedValue(new Error('locked'))

    await expect(importResourceArchive(
      'engine',
      AbsPath.from('/downloads/engine.zip'),
      vi.fn().mockResolvedValue({ alreadyRegistered: true }),
    )).resolves.toEqual({ alreadyRegistered: true })

    expect(loggerWarnMock).toHaveBeenCalledWith(expect.stringContaining('session=session-1'))
  })
})
