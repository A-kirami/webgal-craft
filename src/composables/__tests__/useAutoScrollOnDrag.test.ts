import { afterEach, describe, expect, it, vi } from 'vitest'

import { useAutoScrollOnDrag } from '../useAutoScrollOnDrag'

import type { Ref } from 'vue'

interface TestScrollContainer {
  getBoundingClientRect: () => DOMRect
  scrollBy: ReturnType<typeof vi.fn>
}

function setupAnimationFrame() {
  let nextFrameId = 1
  const callbacks = new Map<number, FrameRequestCallback>()

  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    const frameId = nextFrameId
    nextFrameId++
    callbacks.set(frameId, callback)
    return frameId
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn((frameId: number) => {
    callbacks.delete(frameId)
  }))

  function flushAnimationFrame(timestamp: number) {
    const entries = [...callbacks.entries()]
    callbacks.clear()
    for (const [, callback] of entries) {
      callback(timestamp)
    }
  }

  return { flushAnimationFrame }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useAutoScrollOnDrag', () => {
  it('指针靠近容器边缘时会按指定轴和时间增量滚动', () => {
    const { flushAnimationFrame } = setupAnimationFrame()
    const container: TestScrollContainer = {
      getBoundingClientRect: () => ({
        bottom: 100,
        height: 100,
        left: 0,
        right: 100,
        top: 0,
        width: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
      scrollBy: vi.fn(),
    }
    const containerRef = {
      value: container as unknown as HTMLElement,
    } as unknown as Ref<HTMLElement | undefined>
    const autoScroll = useAutoScrollOnDrag({
      axis: 'vertical',
      container: containerRef,
      edgeSize: 20,
      maxSpeed: 200,
    })

    autoScroll.update({ x: 95, y: 95 })
    flushAnimationFrame(100)
    flushAnimationFrame(200)

    expect(container.scrollBy).toHaveBeenLastCalledWith({
      behavior: 'auto',
      left: 0,
      top: 15,
    })
  })

  it('横向滚动不会写入纵向 scroll delta', () => {
    const { flushAnimationFrame } = setupAnimationFrame()
    const container: TestScrollContainer = {
      getBoundingClientRect: () => ({
        bottom: 100,
        height: 100,
        left: 0,
        right: 100,
        top: 0,
        width: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
      scrollBy: vi.fn(),
    }
    const containerRef = {
      value: container as unknown as HTMLElement,
    } as unknown as Ref<HTMLElement | undefined>
    const autoScroll = useAutoScrollOnDrag({
      axis: 'horizontal',
      container: containerRef,
      edgeSize: 20,
      maxSpeed: 200,
    })

    autoScroll.update({ x: 95, y: 95 })
    flushAnimationFrame(100)
    flushAnimationFrame(200)

    expect(container.scrollBy).toHaveBeenLastCalledWith({
      behavior: 'auto',
      left: 15,
      top: 0,
    })
  })
})
