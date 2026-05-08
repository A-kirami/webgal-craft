import { describe, expect, it, vi } from 'vitest'

import { handleWheelToHorizontalScroll } from '~/utils/wheel'

function createWheelEvent(overrides: Partial<WheelEvent> = {}): WheelEvent {
  const target = {
    scrollLeft: 10,
  }
  const event = {
    currentTarget: target,
    deltaX: 0,
    deltaY: 20,
    preventDefault: vi.fn(),
    ...overrides,
  }

  return event as WheelEvent
}

describe('handleWheelToHorizontalScroll', () => {
  it('会把垂直滚动转换成水平滚动并阻止默认事件', () => {
    const event = createWheelEvent()

    handleWheelToHorizontalScroll(event)

    expect((event.currentTarget as HTMLElement).scrollLeft).toBe(30)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('已经是水平滚动时不会重复处理', () => {
    const event = createWheelEvent({
      deltaX: 30,
      deltaY: 10,
    })

    handleWheelToHorizontalScroll(event)

    expect((event.currentTarget as HTMLElement).scrollLeft).toBe(10)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('没有滚动容器时会安全退出', () => {
    const event = createWheelEvent({
      currentTarget: undefined,
    })

    handleWheelToHorizontalScroll(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})
