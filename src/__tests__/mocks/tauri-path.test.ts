import { describe, expect, it, vi } from 'vitest'

import {
  createDefaultTauriPathMocks,
  createTauriPathModuleMock,
} from './tauri-path'

describe('tauri path mock 辅助器', () => {
  it('提供测试默认使用的路径辅助函数', async () => {
    const pathMock = createDefaultTauriPathMocks()

    await expect(pathMock.basename('/game/scene/start.txt')).resolves.toBe('start.txt')
    await expect(pathMock.dirname('/game/scene/start.txt')).resolves.toBe('/game/scene')
    await expect(pathMock.extname('/game/scene/start.txt')).resolves.toBe('.txt')
    await expect(pathMock.join('/game', 'scene', 'start.txt')).resolves.toBe('/game/scene/start.txt')
    await expect(pathMock.normalize(String.raw`C:\game\scene\start.txt`)).resolves.toBe('C:/game/scene/start.txt')
    expect(pathMock.sep()).toBe('/')
  })

  it('覆盖路径辅助函数时保留模块的真实导出', async () => {
    const pathModule = await createTauriPathModuleMock()

    expect(pathModule.BaseDirectory.Document).toBeTypeOf('number')
    await expect(pathModule.join('/game', 'scene')).resolves.toBe('/game/scene')
  })

  it('允许按测试覆盖指定辅助函数', async () => {
    const joinMock = vi.fn(async (...parts: string[]) => parts.join('::'))

    const pathModule = await createTauriPathModuleMock({
      join: joinMock,
    })

    expect(pathModule.join).toBe(joinMock)
    await expect(pathModule.join('/game', 'scene')).resolves.toBe('/game::scene')
  })
})
