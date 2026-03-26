import { describe, expect, it, vi } from 'vitest'

import {
  resolveCreateGameDefaultEngineId,
  resolveCreateGamePathSuggestion,
  sanitizeCreateGameName,
} from '../create-game-modal'

describe('创建游戏弹窗辅助函数', () => {
  it('会把非法游戏名字符清洗为下划线', () => {
    expect(sanitizeCreateGameName('My:Game/2025')).toBe('My_Game_2025')
    expect(sanitizeCreateGameName('')).toBe('')
  })

  it('未进入手动路径模式时会根据游戏名生成建议保存路径', async () => {
    const joinPath = vi.fn(async (...parts: string[]) => parts.join('/'))

    await expect(resolveCreateGamePathSuggestion({
      gameName: 'My:Game',
      gameSavePath: '/games',
      isComposing: false,
      isPathManuallyChanged: false,
      joinPath,
    })).resolves.toBe('/games/My_Game')

    expect(joinPath).toHaveBeenCalledWith('/games', 'My_Game')
  })

  it('输入法组合中或用户已手动改路径时不会覆盖保存路径', async () => {
    const joinPath = vi.fn(async (...parts: string[]) => parts.join('/'))

    await expect(resolveCreateGamePathSuggestion({
      gameName: 'Demo',
      gameSavePath: '/games',
      isComposing: true,
      isPathManuallyChanged: false,
      joinPath,
    })).resolves.toBeUndefined()

    await expect(resolveCreateGamePathSuggestion({
      gameName: 'Demo',
      gameSavePath: '/games',
      isComposing: false,
      isPathManuallyChanged: true,
      joinPath,
    })).resolves.toBeUndefined()

    expect(joinPath).not.toHaveBeenCalled()
  })

  it('会从引擎选项里取第一个默认引擎 id', () => {
    expect(resolveCreateGameDefaultEngineId([
      { id: 'engine-1' },
      { id: 'engine-2' },
    ])).toBe('engine-1')

    expect(resolveCreateGameDefaultEngineId([])).toBeUndefined()
    expect(resolveCreateGameDefaultEngineId(undefined)).toBeUndefined()
  })
})
