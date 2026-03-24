import '~/__tests__/setup'

import { describe, expect, it } from 'vitest'

import { useStorageSettingsStore } from '~/stores/storage-settings'

describe('存储设置状态仓库', () => {
  it('默认保存路径为空', () => {
    const store = useStorageSettingsStore()

    expect(store.gameSavePath).toBe('')
    expect(store.engineSavePath).toBe('')
  })

  it('支持更新游戏和引擎存储路径', () => {
    const store = useStorageSettingsStore()

    store.gameSavePath = '/games'
    store.engineSavePath = '/engines'

    expect(store.gameSavePath).toBe('/games')
    expect(store.engineSavePath).toBe('/engines')
  })
})
