import { afterEach, describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'
import { resolveAnimationFileTarget, saveAnimationFile } from '~/features/editor/animation/animation-file'

const { loggerWarnMock, saveFileMock, syncAnimationTableMock } = vi.hoisted(() => ({
  loggerWarnMock: vi.fn(),
  saveFileMock: vi.fn(),
  syncAnimationTableMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  warn: loggerWarnMock,
}))

vi.mock('~/services/animation-table-sync', () => ({
  syncAnimationTable: syncAnimationTableMock,
}))

vi.mock('~/services/game-fs', () => ({
  gameFs: {
    writeFile: saveFileMock,
  },
}))

const gamePath = AbsPath.from('C:/games/demo')

afterEach(() => {
  loggerWarnMock.mockReset()
  saveFileMock.mockReset()
  syncAnimationTableMock.mockReset()
})

describe('resolveAnimationFileTarget', () => {
  it('把子目录输入解析为相对 game/animation 的动画名与文件路径', () => {
    expect(resolveAnimationFileTarget(gamePath, 'walk/fade')).toEqual({
      ok: true,
      target: {
        animationName: 'walk/fade',
        filePath: 'C:/games/demo/game/animation/walk/fade.json',
      },
    })
  })

  it('输入已带 .json 后缀时不会重复拼接扩展名', () => {
    expect(resolveAnimationFileTarget(gamePath, 'fade.JSON')).toEqual({
      ok: true,
      target: {
        animationName: 'fade',
        filePath: 'C:/games/demo/game/animation/fade.json',
      },
    })
  })

  it('剔除每段中的非法字符并忽略空路径段', () => {
    expect(resolveAnimationFileTarget(gamePath, ' walk///fa?de ')).toEqual({
      ok: true,
      target: {
        animationName: 'walk/fa_de',
        filePath: 'C:/games/demo/game/animation/walk/fa_de.json',
      },
    })
  })

  it('拒绝空名称', () => {
    expect(resolveAnimationFileTarget(gamePath, ' '.repeat(3))).toEqual({ error: 'empty', ok: false })
    expect(resolveAnimationFileTarget(gamePath, '.json')).toEqual({ error: 'empty', ok: false })
  })

  it('拒绝绝对路径与越界路径', () => {
    for (const input of ['/game/animation/fade', String.raw`C:\games\fade`, String.raw`..\fade`, '..', '../fade', 'walk/../fade', 'walk/./fade']) {
      expect(resolveAnimationFileTarget(gamePath, input), input).toEqual({ error: 'invalid-path', ok: false })
    }
  })

  it('拒绝 animationTable 保留名', () => {
    expect(resolveAnimationFileTarget(gamePath, 'animationTable')).toEqual({ error: 'reserved-name', ok: false })
    expect(resolveAnimationFileTarget(gamePath, 'ANIMATIONTABLE.json')).toEqual({ error: 'reserved-name', ok: false })
  })
})

describe('saveAnimationFile', () => {
  const target = {
    animationName: 'walk/fade',
    filePath: AbsPath.from('C:/games/demo/game/animation/walk/fade.json'),
  }

  it('按动画文档格式写入文件并显式同步动画表', async () => {
    syncAnimationTableMock.mockResolvedValue(undefined)

    await saveAnimationFile(gamePath, target, [
      { duration: 0, alpha: 0 },
      { duration: 240, alpha: 1, ease: 'easeOut' },
    ])

    expect(saveFileMock).toHaveBeenCalledWith(
      'C:/games/demo/game/animation/walk/fade.json',
      `[
  {
    "duration": 0,
    "alpha": 0
  },
  {
    "duration": 240,
    "alpha": 1,
    "ease": "easeOut"
  }
]`,
    )
    expect(syncAnimationTableMock).toHaveBeenCalledWith(gamePath)
  })

  it('动画表同步失败时保留已写入的文件', async () => {
    syncAnimationTableMock.mockRejectedValue(new Error('boom'))

    await expect(saveAnimationFile(gamePath, target, [{ duration: 120 }])).resolves.toBeUndefined()

    expect(saveFileMock).toHaveBeenCalledOnce()
    expect(loggerWarnMock).toHaveBeenCalledOnce()
  })
})
