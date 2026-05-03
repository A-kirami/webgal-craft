import '~/__tests__/setup'

import { describe, expect, it } from 'vitest'

import { useBackupSettingsStore } from '~/stores/backup-settings'

describe('useBackupSettingsStore', () => {
  it('提供合理的默认保留策略', () => {
    const store = useBackupSettingsStore()

    expect(store.maxVersions).toBeGreaterThan(0)
    expect(store.maxDays).toBeGreaterThan(0)
  })

  it('支持更新保留策略', () => {
    const store = useBackupSettingsStore()

    store.maxVersions = 100
    store.maxDays = 7

    expect(store.maxVersions).toBe(100)
    expect(store.maxDays).toBe(7)
  })
})
