import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { defineComponent, h, nextTick, ref } from 'vue'

import { createBrowserConsoleMonitor } from '~/__tests__/browser'
import { createBrowserClickStub, createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'

const {
  existsMock,
  normalizeMock,
  readDirectoryMock,
  statMock,
  workspaceStoreState,
} = vi.hoisted(() => ({
  existsMock: vi.fn(),
  normalizeMock: vi.fn(async (value: string) => value.replaceAll('\\', '/')),
  readDirectoryMock: vi.fn(),
  statMock: vi.fn(),
  workspaceStoreState: {
    CWD: '/games/demo',
    currentGameServeUrl: 'http://127.0.0.1:8899/game/demo/',
  },
}))

vi.mock('@tauri-apps/api/path', async () => {
  const actual = await vi.importActual<typeof import('@tauri-apps/api/path')>('@tauri-apps/api/path')

  return {
    ...actual,
    join: async (...parts: string[]) => parts.join('/'),
    normalize: normalizeMock,
  }
})

vi.mock('@tauri-apps/plugin-fs', () => ({
  copyFile: vi.fn(),
  exists: existsMock,
  mkdir: vi.fn(),
  readDir: vi.fn(),
  readTextFile: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
  stat: statMock,
  watch: vi.fn(),
  writeFile: vi.fn(),
  writeTextFile: vi.fn(),
}))

vi.mock('~/composables/useDirectoryReader', () => ({
  useDirectoryReader: () => ({
    ensurePathWithinRoot: async (path: string) => path,
    readDirectory: readDirectoryMock,
  }),
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: () => workspaceStoreState,
}))

import FilePicker from './FilePicker.vue'

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  DropdownMenu: createBrowserContainerStub('StubDropdownMenu'),
  DropdownMenuCheckboxItem: createBrowserContainerStub('StubDropdownMenuCheckboxItem'),
  DropdownMenuContent: createBrowserContainerStub('StubDropdownMenuContent'),
  DropdownMenuLabel: createBrowserContainerStub('StubDropdownMenuLabel'),
  DropdownMenuRadioGroup: createBrowserContainerStub('StubDropdownMenuRadioGroup'),
  DropdownMenuRadioItem: createBrowserContainerStub('StubDropdownMenuRadioItem'),
  DropdownMenuSeparator: createBrowserContainerStub('StubDropdownMenuSeparator', 'hr'),
  DropdownMenuSub: createBrowserContainerStub('StubDropdownMenuSub'),
  DropdownMenuSubContent: createBrowserContainerStub('StubDropdownMenuSubContent'),
  DropdownMenuSubTrigger: createBrowserContainerStub('StubDropdownMenuSubTrigger'),
  DropdownMenuTrigger: createBrowserContainerStub('StubDropdownMenuTrigger'),
  FileViewer: defineComponent({
    name: 'StubFileViewer',
    props: {
      previewBaseUrl: {
        type: String,
        required: false,
      },
      previewCwd: {
        type: String,
        required: false,
      },
    },
    setup(props) {
      return () => h('div', {
        'data-testid': 'file-viewer-preview-context',
        'data-preview-base-url': props.previewBaseUrl ?? '',
        'data-preview-cwd': props.previewCwd ?? '',
      })
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
  Popover: createBrowserContainerStub('StubPopover'),
  PopoverContent: createBrowserContainerStub('StubPopoverContent'),
  PopoverTrigger: createBrowserContainerStub('StubPopoverTrigger'),
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
    workspaceStoreState.CWD = '/games/demo'
    workspaceStoreState.currentGameServeUrl = 'http://127.0.0.1:8899/game/demo/'
  })

  it('同步外部文件路径中间态时不会立即归一化并回写父层', async () => {
    const result = await renderInBrowser(FilePickerHarness, {
      props: {
        initialValue: 'bg/',
      },
      browser: {
        pinia: true,
      },
      global: {
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
    const result = await renderInBrowser(FilePickerHarness, {
      props: {
        initialValue: '',
      },
      browser: {
        pinia: true,
      },
      global: {
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

  it('会向 FileViewer 传递图片预览上下文', async () => {
    const result = await renderInBrowser(FilePickerHarness, {
      props: {
        initialValue: '',
      },
      browser: {
        pinia: true,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('textbox', { name: 'File Path' }).click()
    await nextTick()

    await expect.element(page.getByTestId('file-viewer-preview-context')).toHaveAttribute('data-preview-cwd', '/games/demo')
    await expect.element(page.getByTestId('file-viewer-preview-context')).toHaveAttribute('data-preview-base-url', 'http://127.0.0.1:8899/game/demo/')
    expectNoConsoleMessage('decodeEntities option is passed but will be ignored in non-browser builds')
    await result.unmount()
  })
})
