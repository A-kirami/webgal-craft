import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { defineComponent, h, nextTick, ref } from 'vue'

import { createBrowserConsoleMonitor } from '~/__tests__/browser'
import { createBrowserClickStub, createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'

const {
  existsMock,
  previewSessionStoreState,
  readDirectoryMock,
  statMock,
  workspaceStoreState,
} = vi.hoisted(() => ({
  existsMock: vi.fn(),
  previewSessionStoreState: {
    currentGameServeUrl: 'http://127.0.0.1:8899/game/demo/',
  },
  readDirectoryMock: vi.fn(),
  statMock: vi.fn(),
  workspaceStoreState: {
    CWD: '/games/demo',
  },
}))

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

vi.mock('~/stores/preview-session', () => ({
  usePreviewSessionStore: () => previewSessionStoreState,
}))

import FilePicker from './FilePicker.vue'

import type { PropType } from 'vue'

type FilePickerStatus = 'none' | 'warning' | 'error'

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
    setup(props, { expose }) {
      expose({
        scrollToIndex: vi.fn(),
      })

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
  Popover: defineComponent({
    name: 'StubPopover',
    props: {
      open: Boolean,
    },
    setup(props, { slots }) {
      return () => h('div', {
        'data-testid': 'file-picker-popover',
        'data-open': String(props.open),
      }, slots.default?.())
    },
  }),
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
    status: {
      type: String as PropType<FilePickerStatus>,
      default: 'none',
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
        'status': props.status,
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
    previewSessionStoreState.currentGameServeUrl = 'http://127.0.0.1:8899/game/demo/'
  })

  it.each([
    {
      buttonClasses: ['text-yellow-700/60', 'hover:text-yellow-700'],
      inputClasses: ['text-yellow-700!', 'bg-yellow/5', 'border-yellow/50', 'focus-visible:ring-yellow/30'],
      status: 'warning' as const,
    },
    {
      buttonClasses: ['text-destructive/60', 'hover:text-destructive'],
      inputClasses: ['text-destructive!', 'bg-destructive/5', 'border-destructive/50', 'focus-visible:ring-destructive/30'],
      status: 'error' as const,
    },
  ])('$status 状态为输入框和清除按钮应用对应样式', async ({ buttonClasses, inputClasses, status }) => {
    await renderInBrowser(FilePickerHarness, {
      props: {
        initialValue: 'figure/model.json',
        status,
      },
      browser: {
        pinia: true,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('textbox', { name: 'File Path' })).toHaveClass(...inputClasses)
    await expect.element(page.getByRole('button', { name: 'filePicker.clearInput' })).toHaveClass(...buttonClasses)
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

  it('资源根目录不存在时点击输入框仍会打开选择器且不读取目录', async () => {
    existsMock.mockResolvedValue(false)
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

    await expect.element(page.getByTestId('file-picker-popover')).toHaveAttribute('data-open', 'true')
    expect(readDirectoryMock).not.toHaveBeenCalled()
    expectNoConsoleMessage('decodeEntities option is passed but will be ignored in non-browser builds')
    await result.unmount()
  })

  it('资源根目录不存在时通过键盘聚焦输入框仍会打开选择器', async () => {
    existsMock.mockResolvedValue(false)
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

    await userEvent.tab()
    await nextTick()

    await expect.element(page.getByRole('textbox', { name: 'File Path' })).toHaveFocus()
    await expect.element(page.getByTestId('file-picker-popover')).toHaveAttribute('data-open', 'true')
    expectNoConsoleMessage('decodeEntities option is passed but will be ignored in non-browser builds')
    await result.unmount()
  })
})
