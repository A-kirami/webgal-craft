import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'

import { useFilePickerHistory } from '../useFilePickerHistory'

const {
  existsMock,
  joinMock,
  useStorageMock,
} = vi.hoisted(() => ({
  existsMock: vi.fn<(path: string) => Promise<boolean>>(async () => true),
  joinMock: vi.fn<(...parts: string[]) => Promise<string>>(async (...parts: string[]) => parts.join('/').replaceAll('//', '/')),
  useStorageMock: vi.fn((_key: string, initial: Record<string, string[]>) => ref(initial)),
}))

vi.mock('@tauri-apps/api/path', () => ({
  join: joinMock,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: existsMock,
}))

vi.mock('@vueuse/core', async () => {
  const actual = await vi.importActual<typeof import('@vueuse/core')>('@vueuse/core')
  return {
    ...actual,
    useStorage: useStorageMock,
  }
})

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve
  })
  return { promise, resolve }
}

function callMaybeRefFunction<TArgs extends unknown[], TResult>(
  method: ((...args: TArgs) => TResult) | Ref<(...args: TArgs) => TResult>,
  ...args: TArgs
): TResult {
  if (typeof method === 'function') {
    return method(...args)
  }
  return method.value(...args)
}

function createFixture() {
  const canonicalRootPath = ref('/assets')
  const historyScopeKey = ref('default')
  const ensurePathWithinRoot = vi.fn(async (path: string) => path)
  const scope = effectScope()

  const history = scope.run(() => useFilePickerHistory({
    canonicalRootPath: () => canonicalRootPath.value,
    ensurePathWithinRoot,
    historyScopeKey: () => historyScopeKey.value,
  }))

  if (!history) {
    throw new TypeError('预期返回 FilePicker history composable')
  }

  return {
    ensurePathWithinRoot,
    history,
    scope,
  }
}

describe('useFilePickerHistory 行为', () => {
  beforeEach(() => {
    existsMock.mockClear()
    joinMock.mockClear()
    useStorageMock.mockClear()
    existsMock.mockImplementation(async () => true)
    joinMock.mockImplementation(async (...parts: string[]) => parts.join('/').replaceAll('//', '/'))
    useStorageMock.mockImplementation((_key: string, initial: Record<string, string[]>) => ref(initial))
  })

  it('刷新 recent history 期间被移除的项不会回写到 invalid map', async () => {
    const { history, scope } = createFixture()
    const pendingExists = createDeferred<boolean>()

    existsMock.mockImplementation(async (path: string) => {
      if (path === '/assets/images/bg/missing.png') {
        return pendingExists.promise
      }
      return true
    })

    callMaybeRefFunction(history.updateRecentHistory, 'images/bg/missing.png')
    expect(history.recentHistory.value).toEqual(['images/bg/missing.png'])

    const refreshTask = callMaybeRefFunction(history.refreshRecentHistoryInvalidState)
    callMaybeRefFunction(history.removeRecentHistoryPaths, ['images/bg/missing.png'])

    pendingExists.resolve(false)
    await refreshTask

    expect(history.recentHistory.value).toEqual([])
    expect(history.recentHistoryInvalidMap.value).toEqual({})

    scope.stop()
  })
})
