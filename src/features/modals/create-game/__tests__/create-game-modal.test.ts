import { describe, expect, it } from 'vitest'

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
    await expect(resolveCreateGamePathSuggestion({
      gameName: 'My:Game',
      gameSavePath: '/games',
      isComposing: false,
      isPathManuallyChanged: false,
    })).resolves.toBe('/games/My_Game')
  })

  it('输入法组合中或用户已手动改路径时不会覆盖保存路径', async () => {
    await expect(resolveCreateGamePathSuggestion({
      gameName: 'Demo',
      gameSavePath: '/games',
      isComposing: true,
      isPathManuallyChanged: false,
    })).resolves.toBeUndefined()

    await expect(resolveCreateGamePathSuggestion({
      gameName: 'Demo',
      gameSavePath: '/games',
      isComposing: false,
      isPathManuallyChanged: true,
    })).resolves.toBeUndefined()
  })

  it('会把 Windows 风格保存目录归一化为 POSIX 路径', async () => {
    await expect(resolveCreateGamePathSuggestion({
      gameName: 'Demo',
      gameSavePath: 'C:\\Games\\',
      isComposing: false,
      isPathManuallyChanged: false,
    })).resolves.toBe('C:/Games/Demo')
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
