import '~/__tests__/setup'

import { describe, expect, it } from 'vitest'

import { useManagedImportStore } from '../managed-import'

describe('useManagedImportStore', () => {
  it('会在官方引擎安装期间保存活动上下文并在完成后清除', () => {
    const store = useManagedImportStore()
    const activity = {
      kind: 'official-engine-install' as const,
      engineName: 'WebGAL',
      engineVersion: '4.6.5',
    }

    expect(store.begin('engine', activity)).toBe(true)
    expect(store.activeActivity).toEqual(activity)
    expect(store.activeKind).toBe('engine')

    store.finish()

    expect(store.activeActivity).toBeUndefined()
    expect(store.activeKind).toBeUndefined()
  })

  it('会在已有导入进行中时拒绝新的活动', () => {
    const store = useManagedImportStore()
    const activity = {
      kind: 'official-engine-install' as const,
      engineName: 'WebGAL',
      engineVersion: '4.6.5',
    }

    expect(store.begin('engine', activity)).toBe(true)
    expect(store.begin('game')).toBe(false)
    expect(store.activeActivity).toEqual(activity)
    expect(store.activeKind).toBe('engine')
  })
})
