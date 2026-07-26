import '~/__tests__/setup'

import { createPinia, setActivePinia } from 'pinia'
import { createPersistedState } from 'pinia-plugin-persistedstate'
import { describe, expect, it } from 'vitest'
import { createApp } from 'vue'

import { useStorageSettingsStore } from '~/stores/storage-settings'

function createMemoryStorage(seed: Record<string, string> = {}) {
  const state = new Map(Object.entries(seed))
  return {
    getItem(key: string) {
      // persistedstate 约定未命中时返回 null，这里显式兼容其接口
      // eslint-disable-next-line unicorn/no-null
      return state.get(key) ?? null
    },
    setItem(key: string, value: string) {
      state.set(key, value)
    },
  }
}

describe('useStorageSettingsStore', () => {
  it('默认保存路径为空', () => {
    const store = useStorageSettingsStore()

    expect(store.gameSavePath).toBe('')
    expect(store.engineSavePath).toBe('')
    expect(store.exportSavePath).toBe('')
    expect(store.templateSavePath).toBe('')
  })

  it('支持更新游戏、引擎、模板和导出存储路径', () => {
    const store = useStorageSettingsStore()

    store.gameSavePath = '/games'
    store.engineSavePath = '/engines'
    store.exportSavePath = '/exports'
    store.templateSavePath = '/templates'

    expect(store.gameSavePath).toBe('/games')
    expect(store.engineSavePath).toBe('/engines')
    expect(store.exportSavePath).toBe('/exports')
    expect(store.templateSavePath).toBe('/templates')
  })

  it('持久化恢复时会重新规范化保存目录路径', () => {
    const pinia = createPinia()
    pinia.use(createPersistedState({
      storage: createMemoryStorage({
        'storage-settings': JSON.stringify({
          gameSavePath: String.raw`c:\games${'\\'}`,
          engineSavePath: String.raw`D:\engines`,
          exportSavePath: String.raw`e:\exports${'\\'}`,
          templateSavePath: String.raw`\\server\share\templates${'\\'}`,
        }),
      }),
    }))
    createApp({}).use(pinia)
    setActivePinia(pinia)

    const store = useStorageSettingsStore()

    expect(store.gameSavePath).toBe('C:/games')
    expect(store.engineSavePath).toBe('D:/engines')
    expect(store.exportSavePath).toBe('E:/exports')
    expect(store.templateSavePath).toBe('//server/share/templates')
  })
})
