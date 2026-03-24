import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'

import { useStatementEditorScrub } from '~/composables/useStatementEditorScrub'

import type { ArgField, EditorField } from '~/helper/command-registry/schema'

type ListenerMap = Record<string, Set<EventListenerOrEventListenerObject>>

interface PointerLikeEvent {
  altKey?: boolean
  button: number
  clientX: number
  currentTarget: { setPointerCapture: (pointerId: number) => void }
  pointerId: number
  pointerType: string
  preventDefault: () => void
  shiftKey?: boolean
}

const originalAddEventListener = globalThis.addEventListener
const originalRemoveEventListener = globalThis.removeEventListener
const listenerMap: ListenerMap = {}
const noop = () => 0

function createArgField(
  key: string,
  type: ArgField['field']['type'],
  options?: Partial<ArgField['field']>,
): ArgField {
  return {
    storageKey: key,
    field: {
      key,
      type,
      label: () => '',
      ...options,
    } as ArgField['field'],
  }
}

function createPointerEvent(overrides?: Partial<PointerLikeEvent>): PointerLikeEvent {
  return {
    button: 0,
    clientX: 100,
    currentTarget: {
      setPointerCapture: noop,
    },
    pointerId: 1,
    pointerType: 'mouse',
    preventDefault: noop,
    ...overrides,
  }
}

function invokeListener(listener: EventListenerOrEventListenerObject, payload: PointerLikeEvent) {
  if (typeof listener === 'function') {
    listener(payload as unknown as Event)
    return
  }
  listener.handleEvent(payload as unknown as Event)
}

function dispatchPointerEvent(eventName: string, payload: Partial<PointerLikeEvent>) {
  const listeners = listenerMap[eventName]
  if (!listeners) {
    return
  }
  const event = createPointerEvent(payload)
  for (const listener of listeners) {
    invokeListener(listener, event)
  }
}

beforeEach(() => {
  const mockedGlobal = globalThis as unknown as {
    addEventListener: typeof globalThis.addEventListener
    removeEventListener: typeof globalThis.removeEventListener
  }

  mockedGlobal.addEventListener = ((event: string, listener: EventListenerOrEventListenerObject) => {
    if (!listenerMap[event]) {
      listenerMap[event] = new Set()
    }
    listenerMap[event].add(listener)
  }) as typeof globalThis.addEventListener

  mockedGlobal.removeEventListener = ((event: string, listener: EventListenerOrEventListenerObject) => {
    listenerMap[event]?.delete(listener)
  }) as typeof globalThis.removeEventListener
})

afterEach(() => {
  for (const key of Object.keys(listenerMap)) {
    listenerMap[key].clear()
    delete listenerMap[key]
  }
  globalThis.addEventListener = originalAddEventListener
  globalThis.removeEventListener = originalRemoveEventListener
})

describe('useStatementEditorScrub', () => {
  it('canScrubParam 根据 surface 与 param 类型生效', () => {
    const contentField = ref()

    const panelScrub = useStatementEditorScrub({
      surface: 'panel',
      contentField,
      readArgValue: () => 0,
      readContentValue: () => '',
      updateArgValue: noop,
      updateContentValue: noop,
    })

    const inlineScrub = useStatementEditorScrub({
      surface: 'inline',
      contentField,
      readArgValue: () => 0,
      readContentValue: () => '',
      updateArgValue: noop,
      updateContentValue: noop,
    })

    expect(panelScrub.canScrubArgField(createArgField('duration', 'number'))).toBe(true)
    expect(panelScrub.canScrubArgField(createArgField('volume', 'number', {
      variant: { panel: 'slider-input', inline: 'input' },
    }))).toBe(false)

    expect(inlineScrub.canScrubArgField(createArgField('duration', 'number'))).toBe(true)
    expect(inlineScrub.canScrubArgField(createArgField('volume', 'number', {
      variant: { panel: 'slider-input', inline: 'input' },
    }))).toBe(true)
    expect(inlineScrub.canScrubArgField(createArgField('title', 'text'))).toBe(false)
  })

  it('参数拖拽会按步长更新并应用边界裁剪', () => {
    const updates: string[] = []
    const contentField = ref()
    const argField = createArgField('duration', 'number', { min: 0, max: 10, scrubStep: 1 })

    const scrub = useStatementEditorScrub({
      surface: 'inline',
      contentField,
      readArgValue: () => 5,
      readContentValue: () => '',
      updateArgValue: (_argField, value) => updates.push(value),
      updateContentValue: noop,
    })

    scrub.handleArgLabelPointerDown(createPointerEvent() as unknown as PointerEvent, argField)

    dispatchPointerEvent('pointermove', { pointerId: 1, clientX: 104 })
    dispatchPointerEvent('pointermove', { pointerId: 1, clientX: 120 }) // 应裁剪到 max=10

    expect(updates).toEqual(['9', '10'])
  })

  it('content 拖拽支持 shift 放大步长并做边界裁剪', () => {
    const updates: string[] = []
    const contentField = ref<EditorField>({
      key: 'content',
      storage: 'content',
      field: {
        key: 'content',
        type: 'number',
        label: () => '',
        unit: () => 'ms',
        min: 0,
        max: 20,
      },
    })

    const scrub = useStatementEditorScrub({
      surface: 'inline',
      contentField,
      readArgValue: () => 0,
      readContentValue: () => '5',
      updateArgValue: noop,
      updateContentValue: value => updates.push(value),
    })

    scrub.handleContentLabelPointerDown(createPointerEvent() as unknown as PointerEvent)

    dispatchPointerEvent('pointermove', { pointerId: 1, clientX: 102, shiftKey: true }) // 5 + 2*10 => 25，裁剪到 20
    expect(updates).toEqual(['20'])
  })

  it('commitSliderInput 会对值做 min/max 裁剪', () => {
    const updates: string[] = []
    const contentField = ref()
    const scrub = useStatementEditorScrub({
      surface: 'inline',
      contentField,
      readArgValue: () => 0,
      readContentValue: () => '',
      updateArgValue: (_argField, value) => updates.push(value),
      updateContentValue: noop,
    })

    const argField = createArgField('volume', 'number', {
      min: 0,
      max: 100,
      variant: { panel: 'slider-input', inline: 'input' },
    })

    scrub.commitSliderInput(argField, { target: { value: '120' } } as unknown as Event)
    scrub.commitSliderInput(argField, { target: { value: '-2' } } as unknown as Event)

    expect(updates).toEqual(['100', '0'])
  })
})
