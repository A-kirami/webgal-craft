/* eslint-disable vue/one-component-per-file, vue/require-default-prop */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, nextTick, onMounted, ref } from 'vue'

import { createBrowserConsoleMonitor } from '~/__tests__/browser'

const {
  inputMountSpy,
} = vi.hoisted(() => ({
  inputMountSpy: vi.fn(),
}))

vi.mock('~/composables/useControlId', () => ({
  useControlId: () => ({
    buildControlId: (suffix: string) => `pair-list-${suffix}`,
  }),
}))

import PairListEditor from './PairListEditor.vue'

const globalStubs = {
  Button: defineComponent({
    name: 'StubButton',
    emits: ['click'],
    setup(_, { attrs, emit, slots }) {
      return () => h('button', {
        ...attrs,
        type: 'button',
        onClick: (event: MouseEvent) => emit('click', event),
      }, slots.default?.())
    },
  }),
  Input: defineComponent({
    name: 'StubInput',
    props: {
      id: {
        type: String,
        required: false,
      },
      modelValue: {
        type: String,
        required: false,
      },
      placeholder: {
        type: String,
        required: false,
      },
    },
    emits: ['update:modelValue'],
    setup(props, { attrs, emit }) {
      onMounted(() => {
        inputMountSpy(props.id ?? props.placeholder ?? 'anonymous-input')
      })

      return () => h('input', {
        ...attrs,
        id: props.id,
        placeholder: props.placeholder,
        value: props.modelValue,
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
      })
    },
  }),
  Label: defineComponent({
    name: 'StubLabel',
    props: {
      for: {
        type: String,
        required: false,
      },
    },
    setup(props, { slots }) {
      return () => h('label', { for: props.for }, slots.default?.())
    },
  }),
}

const PairListHarness = defineComponent({
  name: 'PairListHarness',
  setup() {
    const items = ref([
      { first: 'alpha', second: 'beta' },
      { first: 'gamma', second: 'delta' },
    ])

    function handleUpdateFirst(payload: { index: number, value: string }) {
      items.value = items.value.map((item, index) => index === payload.index
        ? { ...item, first: payload.value }
        : { ...item })
    }

    function handleUpdateSecond(payload: { index: number, value: string }) {
      items.value = items.value.map((item, index) => index === payload.index
        ? { ...item, second: payload.value }
        : { ...item })
    }

    function handleRemove(index: number) {
      items.value = items.value.filter((_, itemIndex) => itemIndex !== index)
    }

    function handleAdd() {
      items.value = [...items.value, { first: '', second: '' }]
    }

    return () => h(PairListEditor, {
      surface: 'panel',
      items: items.value,
      firstLabel: 'First',
      secondLabel: 'Second',
      addLabel: 'Add',
      onUpdateFirst: handleUpdateFirst,
      onUpdateSecond: handleUpdateSecond,
      onRemove: handleRemove,
      onAdd: handleAdd,
    })
  },
})

const { expectNoConsoleMessage } = createBrowserConsoleMonitor()

describe('PairListEditor', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    inputMountSpy.mockReset()
  })

  it('编辑现有行时会保持当前输入框实例，避免焦点丢失', async () => {
    const result = await render(PairListHarness, {
      global: {
        stubs: globalStubs,
      },
    })

    const firstInput = result.container.querySelector<HTMLInputElement>('#pair-list-first-0')
    expect(firstInput).toBeTruthy()

    firstInput!.focus()
    firstInput!.value = 'alpha-updated'
    firstInput!.dispatchEvent(new Event('input', { bubbles: true }))

    await nextTick()

    expect(result.container.ownerDocument.activeElement).toBe(firstInput)
    expect(inputMountSpy).toHaveBeenCalledTimes(4)
    expect(inputMountSpy).toHaveBeenNthCalledWith(1, 'pair-list-first-0')
    expect(inputMountSpy).toHaveBeenNthCalledWith(3, 'pair-list-first-1')
    expectNoConsoleMessage('decodeEntities option is passed but will be ignored in non-browser builds')
  })
})
