import { readFile, readTextFile } from '@tauri-apps/plugin-fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'

import { loadIconEditorSourceData } from '../icon-editor-source'

const readFileMock = vi.mocked(readFile)
const readTextFileMock = vi.mocked(readTextFile)

vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: vi.fn(),
  readTextFile: vi.fn(),
}))

describe('loadIconEditorSourceData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('读取 icon-data 状态和源图快照', async () => {
    readTextFileMock.mockResolvedValue(JSON.stringify({
      backgroundColor: '#112233',
      backgroundOffsetRatio: { x: -0.1, y: 0.2 },
      backgroundScale: 1.25,
      backgroundType: 'image',
      foregroundOffsetRatio: { x: 0.3, y: -0.4 },
      foregroundScale: 0.75,
      iconShape: 'rounded',
      version: 1,
    }))
    readFileMock.mockImplementation(async path => (
      String(path).endsWith('/foreground.png')
        ? new Uint8Array([1, 2])
        : new Uint8Array([3, 4])
    ))

    await expect(loadIconEditorSourceData(AbsPath.from('/games/demo'))).resolves.toEqual({
      backgroundBytes: new Uint8Array([3, 4]),
      state: {
        backgroundColor: '#112233',
        backgroundOffsetRatio: { x: -0.1, y: 0.2 },
        backgroundScale: 1.25,
        backgroundType: 'image',
        foregroundOffsetRatio: { x: 0.3, y: -0.4 },
        foregroundScale: 0.75,
        iconShape: 'rounded',
        version: 1,
      },
      foregroundBytes: new Uint8Array([1, 2]),
    })
    expect(readTextFileMock).toHaveBeenCalledWith('/games/demo/.webgalcraft/icon-data/state.json')
    expect(readFileMock).toHaveBeenCalledWith('/games/demo/.webgalcraft/icon-data/foreground.png')
    expect(readFileMock).toHaveBeenCalledWith('/games/demo/.webgalcraft/icon-data/background.png')
  })

  it('图片背景缺少背景快照时返回空结果', async () => {
    readTextFileMock.mockResolvedValue(JSON.stringify({
      backgroundColor: '#112233',
      backgroundOffsetRatio: { x: 0, y: 0 },
      backgroundScale: 1,
      backgroundType: 'image',
      foregroundOffsetRatio: { x: 0, y: 0 },
      foregroundScale: 1,
      iconShape: 'square',
      version: 1,
    }))
    readFileMock.mockImplementation(async (path) => {
      if (String(path).endsWith('/foreground.png')) {
        return new Uint8Array([1, 2])
      }

      throw new Error('missing background')
    })

    await expect(loadIconEditorSourceData(AbsPath.from('/games/demo'))).resolves.toBeUndefined()
  })

  it('纯色背景只读取前景源图快照', async () => {
    readTextFileMock.mockResolvedValue(JSON.stringify({
      backgroundColor: '#112233',
      backgroundOffsetRatio: { x: 0, y: 0 },
      backgroundScale: 1,
      backgroundType: 'color',
      foregroundOffsetRatio: { x: 0, y: 0 },
      foregroundScale: 1,
      iconShape: 'square',
      version: 1,
    }))
    readFileMock.mockResolvedValue(new Uint8Array([1, 2]))

    await expect(loadIconEditorSourceData(AbsPath.from('/games/demo'))).resolves.toEqual({
      foregroundBytes: new Uint8Array([1, 2]),
      state: {
        backgroundColor: '#112233',
        backgroundOffsetRatio: { x: 0, y: 0 },
        backgroundScale: 1,
        backgroundType: 'color',
        foregroundOffsetRatio: { x: 0, y: 0 },
        foregroundScale: 1,
        iconShape: 'square',
        version: 1,
      },
    })
    expect(readFileMock).toHaveBeenCalledWith('/games/demo/.webgalcraft/icon-data/foreground.png')
    expect(readFileMock).not.toHaveBeenCalledWith('/games/demo/.webgalcraft/icon-data/background.png')
  })

  it('持久化状态解析失败时不会读取源图快照', async () => {
    readTextFileMock.mockResolvedValue(JSON.stringify({
      backgroundColor: '#112233',
      backgroundOffsetRatio: { x: 0, y: 0 },
      backgroundScale: 1,
      backgroundType: 'color',
      foregroundOffsetRatio: { x: 0, y: 0 },
      foregroundScale: 1,
      iconShape: 'square',
      version: 0,
    }))

    await expect(loadIconEditorSourceData(AbsPath.from('/games/demo'))).resolves.toBeUndefined()
    expect(readFileMock).not.toHaveBeenCalled()
  })
})
