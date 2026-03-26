import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, nextTick, onMounted, ref } from 'vue'

import { createBrowserConsoleMonitor } from '~/__tests__/browser'
import { createBrowserClickStub, createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'

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
  Button: createBrowserClickStub('StubButton'),
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
  Label: createBrowserContainerStub('StubLabel', 'label'),
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
    await renderInBrowser(PairListHarness, {
      global: {
        stubs: globalStubs,
      },
    })

    const firstInput = page.getByRole('textbox').first()
    const firstInputElement = firstInput.element() as HTMLInputElement
    await firstInput.click()
    await firstInput.fill('alpha-updated')

    await nextTick()

    expect(document.activeElement).toBe(firstInputElement)
    expect(inputMountSpy).toHaveBeenCalledTimes(4)
    expect(inputMountSpy).toHaveBeenNthCalledWith(1, 'pair-list-first-0')
    expect(inputMountSpy).toHaveBeenNthCalledWith(3, 'pair-list-first-1')
    expectNoConsoleMessage('decodeEntities option is passed but will be ignored in non-browser builds')
  })
})
