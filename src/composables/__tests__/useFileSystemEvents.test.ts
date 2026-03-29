import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import { useFileSystemEvents } from '~/composables/useFileSystemEvents'

describe('useFileSystemEvents', () => {
  it('会在当前作用域销毁后自动移除订阅', () => {
    const eventBus = useFileSystemEvents()
    const listener = vi.fn()
    const scope = effectScope()

    eventBus.reset()

    scope.run(() => {
      useFileSystemEvents().on('file:created', listener)
    })

    eventBus.emit({
      type: 'file:created',
      path: '/game/assets/bg/cover.png',
    })
    expect(listener).toHaveBeenCalledTimes(1)

    scope.stop()

    eventBus.emit({
      type: 'file:created',
      path: '/game/assets/bg/ending.png',
    })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
