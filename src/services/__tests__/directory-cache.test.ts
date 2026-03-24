import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearDirectoryItemsCache,
  invalidateDirectoryItemsCache,
  readDirectoryItemsCached,
} from '~/services/directory-cache'
import { AppError } from '~/types/errors'

const {
  existsMock,
  joinMock,
  loggerWarnMock,
  mimeGetTypeMock,
  normalizeMock,
  readDirMock,
  statMock,
} = vi.hoisted(() => ({
  existsMock: vi.fn(),
  joinMock: vi.fn(async (...parts: string[]) => parts.join('/').replaceAll('//', '/')),
  loggerWarnMock: vi.fn(),
  mimeGetTypeMock: vi.fn(() => 'text/plain'),
  normalizeMock: vi.fn(async (path: string) => path.replaceAll('\\', '/')),
  readDirMock: vi.fn(),
  statMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/path', () => ({
  join: joinMock,
  normalize: normalizeMock,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: existsMock,
  readDir: readDirMock,
  stat: statMock,
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  warn: loggerWarnMock,
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  attachConsole: vi.fn(),
}))

vi.mock('~/plugins/mime', () => ({
  mime: {
    getType: mimeGetTypeMock,
  },
}))

function createDirectoryStat(isDirectory: boolean) {
  return {
    isDirectory,
    size: isDirectory ? undefined : 12,
    mtime: new Date('2024-01-02T03:04:05.000Z'),
    birthtime: new Date('2024-01-01T03:04:05.000Z'),
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('目录缓存', () => {
  beforeEach(() => {
    clearDirectoryItemsCache()
    existsMock.mockReset()
    normalizeMock.mockClear()
    joinMock.mockClear()
    readDirMock.mockReset()
    statMock.mockReset()
    loggerWarnMock.mockReset()
    mimeGetTypeMock.mockReset()
    mimeGetTypeMock.mockReturnValue('text/plain')
  })

  afterEach(() => {
    clearDirectoryItemsCache()
  })

  it('缓存命中时返回克隆结果，避免调用方污染缓存', async () => {
    existsMock.mockResolvedValue(true)
    statMock.mockImplementation(async (path: string) => {
      if (path === '/root') {
        return createDirectoryStat(true)
      }
      return createDirectoryStat(false)
    })
    readDirMock.mockResolvedValue([{ name: 'file.txt', isDirectory: false }])

    const _first = await readDirectoryItemsCached('/root')
    const second = await readDirectoryItemsCached('/root')
    second[0].name = 'mutated'
    const third = await readDirectoryItemsCached('/root')

    expect(readDirMock).toHaveBeenCalledTimes(1)
    expect(third).toEqual([
      expect.objectContaining({
        name: 'file.txt',
        path: '/root/file.txt',
        isDir: false,
        mimeType: 'text/plain',
      }),
    ])
  })

  it('并发读取同一路径时会复用同一个 in-flight 请求', async () => {
    const readDirDeferred = createDeferred<{ name: string, isDirectory: boolean }[]>()
    const readDirStarted = createDeferred<void>()

    existsMock.mockResolvedValue(true)
    statMock.mockImplementation(async (path: string) => {
      if (path === '/root') {
        return createDirectoryStat(true)
      }
      return createDirectoryStat(false)
    })
    readDirMock.mockImplementation(() => {
      readDirStarted.resolve()
      return readDirDeferred.promise
    })

    const firstPromise = readDirectoryItemsCached('/root')
    const secondPromise = readDirectoryItemsCached('/root')
    await readDirStarted.promise

    expect(readDirMock).toHaveBeenCalledTimes(1)

    readDirDeferred.resolve([{ name: 'a.txt', isDirectory: false }])

    await expect(Promise.all([firstPromise, secondPromise])).resolves.toEqual([
      [expect.objectContaining({ path: '/root/a.txt' })],
      [expect.objectContaining({ path: '/root/a.txt' })],
    ])
    expect(readDirMock).toHaveBeenCalledTimes(1)
  })

  it('invalidateDirectoryItemsCache 支持包含子目录并按 comparable path 清理', async () => {
    existsMock.mockResolvedValue(true)
    statMock.mockImplementation(async (path: string) => {
      if (path === '/root' || path === '/root/child') {
        return createDirectoryStat(true)
      }
      return createDirectoryStat(false)
    })
    readDirMock.mockImplementation(async (path: string) => {
      if (path === '/root') {
        return [{ name: 'child', isDirectory: true }]
      }
      return [{ name: 'nested.txt', isDirectory: false }]
    })

    await readDirectoryItemsCached('/root')
    await readDirectoryItemsCached('/root/child')
    await invalidateDirectoryItemsCache(String.raw`\ROOT`, { includeChildren: true })
    await readDirectoryItemsCached('/root')
    await readDirectoryItemsCached('/root/child')

    expect(readDirMock).toHaveBeenCalledTimes(4)
  })

  it('目录项全部读取失败时抛出 IO_ERROR', async () => {
    existsMock.mockResolvedValue(true)
    statMock.mockImplementation(async (path: string) => {
      if (path === '/root') {
        return createDirectoryStat(true)
      }
      throw new AppError('IO_ERROR', `cannot stat ${path}`)
    })
    readDirMock.mockResolvedValue([{ name: 'broken.txt', isDirectory: false }])

    await expect(readDirectoryItemsCached('/root', { useCache: false })).rejects.toMatchObject({
      code: 'IO_ERROR',
      message: '目录读取失败：目录项全部读取失败',
    })
  })
})
