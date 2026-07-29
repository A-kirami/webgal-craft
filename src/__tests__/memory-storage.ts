import type { StorageLike } from 'pinia-plugin-persistedstate'

export function createMemoryStorage(seed: Record<string, string> = {}): StorageLike {
  const state = new Map(Object.entries(seed))
  return {
    // eslint-disable-next-line unicorn/no-null -- StorageLike follows the Web Storage contract.
    getItem: key => state.get(key) ?? null,
    setItem: (key, value) => state.set(key, value),
  }
}
