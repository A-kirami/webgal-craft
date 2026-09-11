import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useColorCommit } from '../useColorCommit'

type ListenerMap = Record<string, Set<EventListenerOrEventListenerObject>>

const originalAddEventListener = globalThis.addEventListener
const originalRemoveEventListener = globalThis.removeEventListener
const listenerMap: ListenerMap = {}

/** 单元环境没有 window，按 useImmediatePointerDrag 的测试方式替身全局监听 */
function installGlobalListenerStub() {
  const mockedGlobal = globalThis as unknown as {
    addEventListener: typeof globalThis.addEventListener
    removeEventListener: typeof globalThis.removeEventListener
  }

  mockedGlobal.addEventListener = ((event: string, listener: EventListenerOrEventListenerObject) => {
    listenerMap[event] ??= new Set()
    listenerMap[event].add(listener)
  }) as typeof globalThis.addEventListener

  mockedGlobal.removeEventListener = ((event: string, listener: EventListenerOrEventListenerObject) => {
    listenerMap[event]?.delete(listener)
  }) as typeof globalThis.removeEventListener
}

function releasePointer(type: 'pointercancel' | 'pointerup' = 'pointerup') {
  for (const listener of listenerMap[type] ?? []) {
    if (typeof listener === 'function') {
      listener(new Event(type))
    } else {
      listener.handleEvent(new Event(type))
    }
  }
}

function createHarness(initialValue: string, options: { preview?: boolean } = {}) {
  let currentValue = initialValue
  const commit = vi.fn<(value: string) => void>()
  const preview = vi.fn<(value: string) => void>()

  const colorCommit = useColorCommit({
    commit,
    preview: options.preview === false ? undefined : preview,
    readValue: () => currentValue,
  })

  return {
    colorCommit,
    commit,
    preview,
    setValue: (value: string) => {
      currentValue = value
    },
  }
}

let scheduledFrames: FrameRequestCallback[] = []

function flushFrame() {
  const callbacks = scheduledFrames
  scheduledFrames = []
  for (const callback of callbacks) {
    callback(0)
  }
}

function pointerDown(button = 0) {
  return { button } as PointerEvent
}

beforeEach(() => {
  installGlobalListenerStub()
  scheduledFrames = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    scheduledFrames.push(callback)
    return scheduledFrames.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {
    scheduledFrames = []
  })
})

afterEach(() => {
  for (const key of Object.keys(listenerMap)) {
    listenerMap[key].clear()
    delete listenerMap[key]
  }

  globalThis.addEventListener = originalAddEventListener
  globalThis.removeEventListener = originalRemoveEventListener
})

describe('useColorCommit', () => {
  it('非拖拽的颜色变化立即写入一次', () => {
    const { colorCommit, commit, setValue } = createHarness('#FF0000')

    setValue('#00FF00')
    colorCommit.handleChange()

    expect(commit).toHaveBeenCalledExactlyOnceWith('#00FF00')
  })

  it('拖拽期间只保留本地值，指针释放后写入最终值一次', () => {
    const { colorCommit, commit, setValue } = createHarness('#FF0000')

    colorCommit.beginInteraction(pointerDown())
    for (const value of ['#FF0101', '#FF0202', '#FF0303']) {
      setValue(value)
      colorCommit.handleChange()
    }

    expect(commit).not.toHaveBeenCalled()

    releasePointer()
    expect(commit).toHaveBeenCalledExactlyOnceWith('#FF0303')
  })

  it('拖拽中的实时流每帧最多一次，且不写入模型', () => {
    const { colorCommit, commit, preview, setValue } = createHarness('#FF0000')

    colorCommit.beginInteraction(pointerDown())
    setValue('#FF0101')
    colorCommit.handleChange()
    setValue('#FF0202')
    colorCommit.handleChange()

    expect(preview).not.toHaveBeenCalled()

    flushFrame()
    expect(preview).toHaveBeenCalledExactlyOnceWith('#FF0202')
    expect(commit).not.toHaveBeenCalled()

    setValue('#FF0303')
    colorCommit.handleChange()
    flushFrame()
    expect(preview.mock.calls.map(([value]) => value)).toEqual(['#FF0202', '#FF0303'])
  })

  it('拖拽结束时丢弃排队中的实时流，只写入最终值', () => {
    const { colorCommit, commit, preview, setValue } = createHarness('#FF0000')

    colorCommit.beginInteraction(pointerDown())
    setValue('#FF0101')
    colorCommit.handleChange()
    releasePointer()
    flushFrame()

    expect(preview).not.toHaveBeenCalled()
    expect(commit).toHaveBeenCalledExactlyOnceWith('#FF0101')
  })

  it('未接实时流时拖拽期间不产生任何上层调用', () => {
    const { colorCommit, commit, setValue } = createHarness('#FF0000', { preview: false })

    colorCommit.beginInteraction(pointerDown())
    setValue('#FF0101')
    colorCommit.handleChange()
    flushFrame()

    expect(commit).not.toHaveBeenCalled()
  })

  it('非拖拽变化不触发实时流', () => {
    const { colorCommit, commit, preview, setValue } = createHarness('#FF0000')

    setValue('#00FF00')
    colorCommit.handleChange()
    flushFrame()

    expect(preview).not.toHaveBeenCalled()
    expect(commit).toHaveBeenCalledExactlyOnceWith('#00FF00')
  })

  it('拖拽回到原值时释放不产生写入', () => {
    const { colorCommit, commit, setValue } = createHarness('#FF0000')

    colorCommit.beginInteraction(pointerDown())
    setValue('#00FF00')
    colorCommit.handleChange()
    setValue('#FF0000')
    colorCommit.handleChange()
    releasePointer()

    expect(commit).not.toHaveBeenCalled()
  })

  it('指针取消同样结束拖拽并写入最终值', () => {
    const { colorCommit, commit, setValue } = createHarness('#FF0000')

    colorCommit.beginInteraction(pointerDown())
    setValue('#123456')
    colorCommit.handleChange()
    releasePointer('pointercancel')

    expect(commit).toHaveBeenCalledExactlyOnceWith('#123456')
  })

  it('释放后再次变化仍按非拖拽路径提交', () => {
    const { colorCommit, commit, setValue } = createHarness('#FF0000')

    colorCommit.beginInteraction(pointerDown())
    setValue('#00FF00')
    releasePointer()

    setValue('#0000FF')
    colorCommit.handleChange()

    expect(commit.mock.calls.map(([value]) => value)).toEqual(['#00FF00', '#0000FF'])
  })

  it('非主键按下不进入拖拽，变化立即写入', () => {
    const { colorCommit, commit, setValue } = createHarness('#FF0000')

    colorCommit.beginInteraction(pointerDown(2))
    setValue('#00FF00')
    colorCommit.handleChange()

    expect(commit).toHaveBeenCalledExactlyOnceWith('#00FF00')
  })

  it('写入过的值不重复提交', () => {
    const { colorCommit, commit, setValue } = createHarness('#FF0000')

    setValue('#00FF00')
    colorCommit.handleChange()
    colorCommit.handleChange()

    expect(commit).toHaveBeenCalledExactlyOnceWith('#00FF00')
  })

  it('重置基线后与外部值相同的颜色不再写入', () => {
    const { colorCommit, commit, setValue } = createHarness('#FF0000')

    setValue('#00FF00')
    colorCommit.setBaseline('#00FF00')
    colorCommit.handleChange()

    expect(commit).not.toHaveBeenCalled()
  })
})
