import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'

import AnimationTimeline from './AnimationTimeline.vue'

import type { AnimationEditorKeyframe } from '~/features/editor/animation/animation-inspector'

const useElementSizeMock = vi.hoisted(() => vi.fn(() => ({
  height: { value: 108 },
  width: { value: 640 },
})))

vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vueuse/core')>()
  return {
    ...actual,
    useElementSize: useElementSizeMock,
  }
})

const ScrollAreaStub = defineComponent({
  name: 'StubScrollArea',
  setup(_, { expose, slots }) {
    const viewportElement = document.createElement('div')
    Object.defineProperty(viewportElement, 'clientWidth', {
      configurable: true,
      value: 640,
    })

    expose({
      viewport: {
        viewportElement,
      },
    })

    return () => h('div', slots.default?.())
  },
})

function createPointerEvent(type: string, overrides: PointerEventInit = {}): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    button: 0,
    buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
    cancelable: true,
    clientX: 0,
    pointerId: 1,
    pointerType: 'mouse',
    ...overrides,
  })
}

const linearTwoKeyframes: AnimationEditorKeyframe[] = [
  {
    cumulativeTime: 120,
    duration: 120,
    id: 1,
  },
  {
    cumulativeTime: 320,
    duration: 200,
    ease: 'linear',
    id: 2,
  },
]

const zeroStartThreeKeyframes: AnimationEditorKeyframe[] = [
  {
    cumulativeTime: 0,
    duration: 0,
    id: 1,
  },
  {
    cumulativeTime: 200,
    duration: 200,
    id: 2,
  },
  {
    cumulativeTime: 450,
    duration: 250,
    id: 3,
  },
]

const narrowStartKeyframes: AnimationEditorKeyframe[] = [
  {
    cumulativeTime: 9,
    duration: 9,
    id: 1,
  },
  {
    cumulativeTime: 209,
    duration: 200,
    id: 2,
  },
]

function renderTimeline(options: {
  keyframes: readonly AnimationEditorKeyframe[]
  onResizeDuration?: (payload: { duration: number, flush: boolean, id: number }) => void
  selectedId?: number
  totalDuration: number
}) {
  renderInBrowser(AnimationTimeline, {
    props: {
      keyframes: options.keyframes,
      onResizeDuration: options.onResizeDuration,
      selectedId: options.selectedId ?? 1,
      totalDuration: options.totalDuration,
    },
    global: {
      stubs: {
        ScrollArea: ScrollAreaStub,
        ScrollBar: true,
      },
    },
  })
}

describe('AnimationTimeline', () => {
  afterEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('结束标记与顶部刻度共享锚点，并在时间轴边界保持正确对齐', () => {
    renderTimeline({
      keyframes: zeroStartThreeKeyframes,
      totalDuration: 450,
    })

    for (const time of [0, 200]) {
      const timeKey = String(time)
      const rulerMark = document.querySelector<HTMLElement>(`[data-animation-ruler-mark="${CSS.escape(timeKey)}"]`)
      const endMarker = document.querySelector<HTMLElement>(`[data-animation-end-marker="${CSS.escape(timeKey)}"]`)

      expect(rulerMark).not.toBeNull()
      expect(endMarker).not.toBeNull()
      expect(endMarker?.style.left).toBe(rulerMark?.style.left)
    }

    const zeroEndMarker = document.querySelector<HTMLElement>('[data-animation-end-marker="0"]')
    expect(zeroEndMarker?.style.left).toBe('0%')

    const zeroEndMarkerLabel = zeroEndMarker?.querySelector<HTMLElement>('span')
    const middleEndMarkerLabel = document
      .querySelector<HTMLElement>('[data-animation-end-marker="200"]')
      ?.querySelector<HTMLElement>('span')
    const lastEndMarkerLabel = document
      .querySelector<HTMLElement>('[data-animation-end-marker="450"]')
      ?.querySelector<HTMLElement>('span')

    expect(zeroEndMarkerLabel?.className).toContain('translate-x-0')
    expect(middleEndMarkerLabel?.className).toContain('-translate-x-1/2')
    expect(lastEndMarkerLabel?.className).toContain('-translate-x-full')
  })

  it('最后一个时间块可以贴到时间轨道末端，不为显式末端缓冲区预留空白', () => {
    renderTimeline({
      keyframes: linearTwoKeyframes,
      totalDuration: 320,
    })

    const lastSpan = [...document.querySelectorAll<HTMLElement>('button[type="button"]')].at(-1)

    expect(lastSpan).not.toBeNull()

    const left = Number.parseFloat(lastSpan!.style.left)
    const width = Number.parseFloat(lastSpan!.style.width)

    expect(left + width).toBeCloseTo(100)
  })

  it('单个结束标记仍然使用末端对齐，避免贴在右边界时向外溢出', () => {
    renderTimeline({
      keyframes: [
        {
          cumulativeTime: 320,
          duration: 320,
          id: 1,
        },
      ],
      totalDuration: 320,
    })

    const endMarker = document.querySelector<HTMLElement>('[data-animation-end-marker="320"]')
    const endMarkerLabel = endMarker?.querySelector<HTMLElement>('span')

    expect(endMarkerLabel).not.toBeNull()
    expect(endMarkerLabel?.className).toContain('-translate-x-full')
  })

  it('被最小宽度撑开的 9ms 起始帧可以继续拖拽回 0ms', () => {
    const onResizeDuration = vi.fn()

    renderTimeline({
      keyframes: narrowStartKeyframes,
      onResizeDuration,
      totalDuration: 209,
    })

    const handle = document.querySelector<HTMLElement>('[data-span-id="1"]')
    expect(handle).not.toBeNull()

    handle!.dispatchEvent(createPointerEvent('pointerdown', { clientX: 100 }))
    globalThis.dispatchEvent(createPointerEvent('pointermove', { clientX: 91 }))
    globalThis.dispatchEvent(createPointerEvent('pointerup', { clientX: 91 }))

    expect(onResizeDuration).toHaveBeenCalledWith({
      duration: 0,
      flush: true,
      id: 1,
    })
  })
})
