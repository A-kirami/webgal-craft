import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

const {
  liveQueryMock,
  observerRef,
  unsubscribeMock,
} = vi.hoisted(() => {
  const observerRef = {
    current: undefined as undefined | {
      next?: (value: unknown) => void
    },
  }
  const unsubscribeMock = vi.fn()
  const liveQueryMock = vi.fn(() => ({
    subscribe: vi.fn((observer: { next?: (value: unknown) => void } | ((value: unknown) => void)) => {
      observerRef.current = typeof observer === 'function'
        ? { next: observer }
        : observer

      return {
        closed: false,
        unsubscribe: unsubscribeMock,
      }
    }),
  }))

  return {
    liveQueryMock,
    observerRef,
    unsubscribeMock,
  }
})

vi.mock('dexie', () => ({
  liveQuery: liveQueryMock,
}))

import { useDexieLiveQuery } from '../useDexieLiveQuery'

describe('useDexieLiveQuery', () => {
  beforeEach(() => {
    liveQueryMock.mockClear()
    unsubscribeMock.mockClear()
    observerRef.current = undefined
  })

  it('订阅 liveQuery 后会把最新结果写入 ref', () => {
    const value = useDexieLiveQuery(() => ['initial'])

    expect(value.value).toBeUndefined()

    observerRef.current?.next?.(['first', 'second'])

    expect(value.value).toEqual(['first', 'second'])
  })

  it('当前作用域释放时会取消订阅', () => {
    const scope = effectScope()

    scope.run(() => {
      useDexieLiveQuery(() => ['item'])
    })
    scope.stop()

    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
  })
})
