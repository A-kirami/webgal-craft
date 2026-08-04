import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath, RelPath } from '~/domain/path'

import { buildIconExportOutputs, convertPngToIco, saveIconEditorOutputs } from '../icon-editor-export'
import { createDefaultIconEditorState } from '../icon-editor-state'

import type { IconEditorImageSource } from '../icon-editor-state'

const { deleteFileMock, existsMock, mkdirMock, writeFileMock } = vi.hoisted(() => ({
  deleteFileMock: vi.fn(),
  existsMock: vi.fn(),
  mkdirMock: vi.fn(),
  writeFileMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: existsMock,
  mkdir: mkdirMock,
  writeFile: writeFileMock,
}))

vi.mock('~/commands/fs', () => ({
  fsCmds: {
    deleteFile: deleteFileMock,
  },
}))

const {
  canvasToPngBytesMock,
  renderIconCanvasMock,
  renderIconSourceSnapshotCanvasMock,
} = vi.hoisted(() => ({
  canvasToPngBytesMock: vi.fn(async canvas => new Uint8Array([canvas.width, canvas.height])),
  renderIconCanvasMock: vi.fn(() => ({ height: 1, width: 137 })),
  renderIconSourceSnapshotCanvasMock: vi.fn(source => ({
    height: source.image.naturalHeight || source.image.height,
    width: source.image.naturalWidth || source.image.width,
  })),
}))

vi.mock('../icon-editor-render', () => ({
  canvasToPngBytes: canvasToPngBytesMock,
  renderIconCanvas: renderIconCanvasMock,
  renderIconSourceSnapshotCanvas: renderIconSourceSnapshotCanvasMock,
}))

function createImageSource(bytes: number[] = [1, 2, 3], width = 10, height = 11): IconEditorImageSource {
  return {
    bytes: new Uint8Array(bytes),
    image: {
      height,
      naturalHeight: height,
      naturalWidth: width,
      width,
    } as HTMLImageElement,
  }
}

describe('图标编辑器导出流程', () => {
  beforeEach(() => {
    canvasToPngBytesMock.mockClear()
    deleteFileMock.mockResolvedValue(undefined)
    existsMock.mockResolvedValue(false)
    mkdirMock.mockResolvedValue(undefined)
    renderIconCanvasMock.mockClear()
    renderIconSourceSnapshotCanvasMock.mockClear()
    writeFileMock.mockResolvedValue(undefined)
  })

  it('保存时生成根级 Web 运行时图标和 editor source 数据', async () => {
    const state = createDefaultIconEditorState()
    state.foregroundImage = createImageSource([11, 12])
    state.backgroundType = 'image'
    state.backgroundImage = createImageSource([8, 9], 12, 13)
    state.backgroundColor = '#112233'
    state.backgroundOffsetRatio = { x: -0.1, y: 0.2 }
    state.backgroundScale = 1.25
    state.foregroundOffsetRatio = { x: 0.3, y: -0.4 }
    state.foregroundScale = 0.75
    state.iconShape = 'circle'

    const outputs = await buildIconExportOutputs(state)

    expect(outputs.map(output => output.relativePath)).toEqual([
      RelPath.from('icons/favicon.ico'),
      RelPath.from('icons/apple-touch-icon.png'),
      RelPath.from('icons/icon-192.png'),
      RelPath.from('icons/icon-512.png'),
      RelPath.from('icons/icon-192-maskable.png'),
      RelPath.from('icons/icon-512-maskable.png'),
      RelPath.from('.webgalcraft/icon-data/state.json'),
      RelPath.from('.webgalcraft/icon-data/foreground.png'),
      RelPath.from('.webgalcraft/icon-data/background.png'),
    ])
    expect(outputs.find(output => output.relativePath === RelPath.from('.webgalcraft/icon-data/foreground.png'))?.bytes).toEqual(new Uint8Array([10, 11]))
    expect(outputs.find(output => output.relativePath === RelPath.from('.webgalcraft/icon-data/background.png'))?.bytes).toEqual(new Uint8Array([12, 13]))
    expect(renderIconSourceSnapshotCanvasMock).toHaveBeenCalledWith(state.foregroundImage)
    expect(renderIconSourceSnapshotCanvasMock).toHaveBeenCalledWith(state.backgroundImage)

    const stateJson = outputs.find(output => output.relativePath === RelPath.from('.webgalcraft/icon-data/state.json'))
    expect(JSON.parse(new TextDecoder().decode(stateJson?.bytes))).toEqual({
      backgroundColor: '#112233',
      backgroundOffsetRatio: { x: -0.1, y: 0.2 },
      backgroundScale: 1.25,
      backgroundType: 'image',
      foregroundOffsetRatio: { x: 0.3, y: -0.4 },
      foregroundScale: 0.75,
      iconShape: 'circle',
      version: 1,
    })
  })

  it('纯色背景不会写入背景源图快照', async () => {
    const state = createDefaultIconEditorState()
    state.foregroundImage = createImageSource([11, 12])
    state.backgroundType = 'color'
    state.backgroundImage = createImageSource([8, 9])

    const outputs = await buildIconExportOutputs(state)

    expect(outputs.map(output => output.relativePath)).toContain(RelPath.from('.webgalcraft/icon-data/state.json'))
    expect(outputs.map(output => output.relativePath)).toContain(RelPath.from('.webgalcraft/icon-data/foreground.png'))
    expect(outputs.map(output => output.relativePath)).not.toContain(RelPath.from('.webgalcraft/icon-data/background.png'))
    expect(renderIconSourceSnapshotCanvasMock).toHaveBeenCalledOnce()
  })

  it('没有前景图时拒绝生成输出', async () => {
    await expect(buildIconExportOutputs(createDefaultIconEditorState())).rejects.toThrow('请选择前景图后再生成图标')
  })

  it('会把 256px PNG 包装为 ICO 容器', () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71])
    const icoBytes = convertPngToIco(pngBytes, 256)

    expect(icoBytes.slice(0, 6)).toEqual(new Uint8Array([0, 0, 1, 0, 1, 0]))
    expect(icoBytes[6]).toBe(0)
    expect(icoBytes[7]).toBe(0)
    expect(icoBytes.slice(22)).toEqual(pngBytes)
  })

  it('写入图标输出前会创建对应父目录', async () => {
    await saveIconEditorOutputs(AbsPath.from('/games/demo'), [
      {
        bytes: new Uint8Array([1]),
        relativePath: RelPath.from('icons/favicon.ico'),
      },
      {
        bytes: new Uint8Array([2]),
        relativePath: RelPath.from('.webgalcraft/icon-data/state.json'),
      },
    ])

    expect(mkdirMock).toHaveBeenCalledWith('/games/demo/icons', { recursive: true })
    expect(mkdirMock).toHaveBeenCalledWith('/games/demo/.webgalcraft/icon-data', { recursive: true })
    expect(writeFileMock).toHaveBeenCalledWith('/games/demo/icons/favicon.ico', new Uint8Array([1]))
    expect(writeFileMock).toHaveBeenCalledWith('/games/demo/.webgalcraft/icon-data/state.json', new Uint8Array([2]))
  })

  it('纯色背景保存时会清理旧的背景源图快照', async () => {
    existsMock.mockResolvedValueOnce(true)

    await saveIconEditorOutputs(AbsPath.from('/games/demo'), [
      {
        bytes: new Uint8Array([1]),
        relativePath: RelPath.from('.webgalcraft/icon-data/state.json'),
      },
      {
        bytes: new Uint8Array([2]),
        relativePath: RelPath.from('.webgalcraft/icon-data/foreground.png'),
      },
    ])

    expect(existsMock).toHaveBeenCalledWith('/games/demo/.webgalcraft/icon-data/background.png')
    expect(deleteFileMock).toHaveBeenCalledWith('/games/demo/.webgalcraft/icon-data/background.png', true)
  })
})
