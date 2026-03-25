/* eslint-disable vue/one-component-per-file, vue/require-default-prop */
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, nextTick, ref } from 'vue'

import { createBrowserConsoleMonitor, createBrowserLiteI18n } from '~/__tests__/browser'

const {
  existsMock,
  normalizeMock,
  readDirectoryMock,
  statMock,
} = vi.hoisted(() => ({
  existsMock: vi.fn(),
  normalizeMock: vi.fn(async (value: string) => value.replaceAll('\\', '/')),
  readDirectoryMock: vi.fn(),
  statMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/path', () => ({
  join: async (...parts: string[]) => parts.join('/'),
  normalize: normalizeMock,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: existsMock,
  stat: statMock,
}))

vi.mock('~/composables/useDirectoryReader', () => ({
  useDirectoryReader: () => ({
    ensurePathWithinRoot: async (path: string) => path,
    readDirectory: readDirectoryMock,
  }),
}))

import FilePicker from './FilePicker.vue'

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
  DropdownMenu: defineComponent({
    name: 'StubDropdownMenu',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  DropdownMenuCheckboxItem: defineComponent({
    name: 'StubDropdownMenuCheckboxItem',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  DropdownMenuContent: defineComponent({
    name: 'StubDropdownMenuContent',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  DropdownMenuLabel: defineComponent({
    name: 'StubDropdownMenuLabel',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  DropdownMenuRadioGroup: defineComponent({
    name: 'StubDropdownMenuRadioGroup',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  DropdownMenuRadioItem: defineComponent({
    name: 'StubDropdownMenuRadioItem',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  DropdownMenuSeparator: defineComponent({
    name: 'StubDropdownMenuSeparator',
    setup() {
      return () => h('hr')
    },
  }),
  DropdownMenuSub: defineComponent({
    name: 'StubDropdownMenuSub',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  DropdownMenuSubContent: defineComponent({
    name: 'StubDropdownMenuSubContent',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  DropdownMenuSubTrigger: defineComponent({
    name: 'StubDropdownMenuSubTrigger',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  DropdownMenuTrigger: defineComponent({
    name: 'StubDropdownMenuTrigger',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  FileViewer: defineComponent({
    name: 'StubFileViewer',
    setup() {
      return () => h('div')
    },
  }),
  Input: defineComponent({
    name: 'StubInput',
    props: {
      disabled: Boolean,
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
    emits: ['blur', 'click', 'focus', 'keydown', 'update:modelValue'],
    setup(props, { attrs, emit }) {
      return () => h('input', {
        ...attrs,
        disabled: props.disabled,
        id: props.id,
        placeholder: props.placeholder,
        value: props.modelValue,
        onBlur: (event: FocusEvent) => emit('blur', event),
        onClick: (event: MouseEvent) => emit('click', event),
        onFocus: (event: FocusEvent) => emit('focus', event),
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
        onKeydown: (event: KeyboardEvent) => emit('keydown', event),
      })
    },
  }),
  PathBreadcrumb: defineComponent({
    name: 'StubPathBreadcrumb',
    setup() {
      return () => h('div')
    },
  }),
  Popover: defineComponent({
    name: 'StubPopover',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  PopoverContent: defineComponent({
    name: 'StubPopoverContent',
    setup(_, { attrs, slots }) {
      return () => h('div', attrs, slots.default?.())
    },
  }),
  PopoverTrigger: defineComponent({
    name: 'StubPopoverTrigger',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
}

const FilePickerHarness = defineComponent({
  name: 'FilePickerHarness',
  props: {
    initialValue: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const model = ref(props.initialValue)
    const updates = ref<string[]>([])

    function handleUpdate(value: string) {
      updates.value = [...updates.value, value]
      model.value = value
    }

    return () => h('div', [
      h(FilePicker, {
        'modelValue': model.value,
        'inputId': 'file-picker-input',
        'rootPath': '/assets',
        'onUpdate:modelValue': handleUpdate,
      }),
      h('label', { for: 'file-picker-input' }, 'File Path'),
      h('output', { 'data-testid': 'model' }, model.value),
      h('output', { 'data-testid': 'updates' }, updates.value.join('|')),
    ])
  },
})

const { expectNoConsoleMessage } = createBrowserConsoleMonitor()

describe('FilePicker', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    existsMock.mockReset()
    normalizeMock.mockClear()
    readDirectoryMock.mockReset()
    statMock.mockReset()

    existsMock.mockResolvedValue(true)
    readDirectoryMock.mockResolvedValue({
      absolutePath: '/assets',
      items: [],
      requestId: 1,
    })
    statMock.mockResolvedValue({
      isDirectory: true,
    })
  })

  it('同步外部文件路径中间态时不会立即归一化并回写父层', async () => {
    const result = await render(FilePickerHarness, {
      props: {
        initialValue: 'bg/',
      },
      global: {
        plugins: [createPinia(), createBrowserLiteI18n()],
        stubs: globalStubs,
      },
    })

    await nextTick()

    await expect.element(page.getByTestId('model')).toHaveTextContent('bg/')
    await expect.element(page.getByTestId('updates')).toHaveTextContent('')
    expectNoConsoleMessage('decodeEntities option is passed but will be ignored in non-browser builds')
    await result.unmount()
  })

  it('用户显式提交输入时仍会发出归一化后的路径', async () => {
    const result = await render(FilePickerHarness, {
      props: {
        initialValue: '',
      },
      global: {
        plugins: [createPinia(), createBrowserLiteI18n()],
        stubs: globalStubs,
      },
    })

    const input = page.getByRole('textbox', { name: 'File Path' })
    await input.click()
    await input.fill('bg/dir/')
    await userEvent.keyboard('{Enter}')

    await nextTick()

    await expect.element(page.getByTestId('model')).toHaveTextContent('bg/dir')
    await expect.element(page.getByTestId('updates')).toHaveTextContent('bg/dir')
    expectNoConsoleMessage('decodeEntities option is passed but will be ignored in non-browser builds')
    await result.unmount()
  })
})
