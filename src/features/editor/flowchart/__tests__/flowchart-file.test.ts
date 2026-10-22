import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'
import { AppError } from '~/types/errors'

import { flowchartFilePath, readFlowchartFile, writeFlowchartFile } from '../flowchart-file'

const { readDocumentFileMock, writeFileMock } = vi.hoisted(() => ({
  readDocumentFileMock: vi.fn(),
  writeFileMock: vi.fn(),
}))

vi.mock('~/services/game-fs', () => ({
  gameFs: {
    readDocumentFile: readDocumentFileMock,
    writeFile: writeFileMock,
  },
}))

vi.mock('~/stores/file', () => ({
  useFileStore: () => ({ initialized: Promise.resolve() }),
}))

const gamePath = AbsPath.from('/games/demo')

describe('flowchart file', () => {
  beforeEach(() => {
    readDocumentFileMock.mockReset()
    writeFileMock.mockReset()
  })

  it('指向工程内的 game/flowchart.json', () => {
    expect(flowchartFilePath(gamePath)).toBe('/games/demo/game/flowchart.json')
  })

  it('文件缺失时返回 undefined', async () => {
    readDocumentFileMock.mockRejectedValue(new AppError('NOT_FOUND', '文件不存在'))

    await expect(readFlowchartFile(gamePath)).resolves.toBeUndefined()
    expect(readDocumentFileMock).toHaveBeenCalledWith(AbsPath.from('/games/demo/game/flowchart.json'))
  })

  it('读取并解码 UTF-8 内容', async () => {
    readDocumentFileMock.mockResolvedValue(new TextEncoder().encode('{"flowcharts":[]}'))

    await expect(readFlowchartFile(gamePath)).resolves.toBe('{"flowcharts":[]}')
  })

  it('其他读取错误照常抛出，不当作文件缺失', async () => {
    const failure = new AppError('VFS_ERROR', '读写层失败')
    readDocumentFileMock.mockRejectedValue(failure)

    await expect(readFlowchartFile(gamePath)).rejects.toBe(failure)
  })

  it('写盘经由游戏文件服务', async () => {
    await writeFlowchartFile(gamePath, '{}')

    expect(writeFileMock).toHaveBeenCalledWith(AbsPath.from('/games/demo/game/flowchart.json'), '{}')
  })
})
