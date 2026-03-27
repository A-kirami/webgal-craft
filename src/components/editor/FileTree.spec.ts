import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { defineComponent, h, nextTick, reactive } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'
import { useShortcutDispatcher } from '~/features/editor/shortcut/useShortcutDispatcher'

const {
  handleErrorMock,
  renameFileMock,
  useModalStoreMock,
  useEditorUIStateStoreMock,
  useTabsStoreMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  handleErrorMock: vi.fn(),
  renameFileMock: vi.fn(),
  useModalStoreMock: vi.fn(),
  useEditorUIStateStoreMock: vi.fn(),
  useTabsStoreMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/path', () => ({
  basename: vi.fn(async (filePath: string) => filePath.split(/[/\\]/).at(-1) ?? ''),
  dirname: vi.fn(async (filePath: string) => filePath.replace(/[\\/][^\\/]+$/, '')),
  extname: vi.fn(async (filePath: string) => {
    const match = /\.[^./\\]+$/.exec(filePath)
    return match?.[0] ?? ''
  }),
  join: vi.fn(async (...parts: string[]) => parts.join('/')),
  normalize: vi.fn((filePath: string) => filePath.replaceAll('\\', '/')),
  sep: '/',
}))

vi.mock('~/services/game-fs', () => ({
  gameFs: {
    renameFile: renameFileMock,
  },
}))

vi.mock('~/stores/editor-ui-state', () => ({
  useEditorUIStateStore: useEditorUIStateStoreMock,
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: useModalStoreMock,
}))

vi.mock('~/stores/tabs', () => ({
  useTabsStore: useTabsStoreMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

vi.mock('~/utils/error-handler', () => ({
  handleError: handleErrorMock,
}))

vi.mock('~/utils/sort', () => ({
  createItemComparator: <T>(_sortBy: string, sortOrder: string, accessor: {
    name: (item: T) => string
  }) => {
    return (left: T, right: T) => {
      const result = accessor.name(left).localeCompare(accessor.name(right))
      return sortOrder === 'desc' ? -result : result
    }
  },
  isValidPositiveNumber: (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) && value >= 0,
}))

import FileTree from './FileTree.vue'

interface FileTreeTestItem extends Record<string, unknown> {
  children?: FileTreeTestItem[]
  name?: string
  path: string
}

interface FlattenedTreeItem {
  _id: string
  bind: Record<string, unknown>
  hasChildren: boolean
  index: number
  level: number
  value: FileTreeTestItem
}

function flattenItems(
  items: FileTreeTestItem[],
  getKey: (item: Record<string, unknown>) => string,
  level: number = 1,
): FlattenedTreeItem[] {
  return items.flatMap((item, index) => {
    const flattenedItem = {
      _id: getKey(item),
      bind: {},
      hasChildren: Array.isArray(item.children),
      index,
      level,
      value: item,
    }

    const children: ReturnType<typeof flattenItems> = Array.isArray(item.children)
      ? flattenItems(item.children, getKey, level + 1)
      : []

    return [flattenedItem, ...children]
  })
}

const globalStubs = {
  FileTreeContextMenu: defineComponent({
    name: 'StubFileTreeContextMenu',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  Input: defineComponent({
    name: 'StubInput',
    props: {
      modelValue: String,
    },
    emits: ['blur', 'keydown.enter', 'keydown.escape', 'update:modelValue'],
    setup(props, { attrs, emit }) {
      return () => h('input', {
        ...attrs,
        value: props.modelValue,
        onBlur: () => emit('blur'),
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
        onKeydown: (event: KeyboardEvent) => {
          if (event.key === 'Enter') {
            emit('keydown.enter', event)
          }
          if (event.key === 'Escape') {
            emit('keydown.escape', event)
          }
        },
      })
    },
  }),
  ScrollArea: defineComponent({
    name: 'StubScrollArea',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  Tooltip: defineComponent({
    name: 'StubTooltip',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  TooltipContent: defineComponent({
    name: 'StubTooltipContent',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  TooltipProvider: defineComponent({
    name: 'StubTooltipProvider',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  TooltipTrigger: defineComponent({
    name: 'StubTooltipTrigger',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  Tree: defineComponent({
    name: 'StubTree',
    inheritAttrs: false,
    props: {
      class: {
        type: String,
        required: false,
      },
      expanded: {
        type: Array,
        required: false,
      },
      getKey: {
        type: Function,
        required: true,
      },
      items: {
        type: Array,
        required: true,
      },
      modelValue: {
        type: Object,
        required: false,
      },
      selectionBehavior: {
        type: String,
        required: false,
      },
    },
    emits: ['update:expanded', 'update:modelValue'],
    setup(props, { emit, slots }) {
      return () => h('div', slots.default?.({
        flattenItems: flattenItems(
          props.items as FileTreeTestItem[],
          props.getKey as (item: Record<string, unknown>) => string,
        ).map(item => ({
          ...item,
          bind: {
            ...item.bind,
            onClick: () => emit('update:modelValue', item.value),
          },
        })),
      }))
    },
  }),
  TreeItem: defineComponent({
    name: 'StubTreeItem',
    emits: ['auxclick', 'click', 'dblclick', 'keydown.enter', 'keydown.escape', 'keydown.f2'],
    setup(_, { attrs, emit, slots }) {
      return () => h('div', {
        ...attrs,
        role: 'treeitem',
        tabIndex: 0,
        onAuxclick: (event: MouseEvent) => emit('auxclick', event),
        onClick: (event: MouseEvent) => emit('click', event),
        onDblclick: (event: MouseEvent) => emit('dblclick', event),
        onKeydown: (event: KeyboardEvent) => {
          if (event.key === 'Enter') {
            emit('keydown.enter', event)
          }
          if (event.key === 'Escape') {
            emit('keydown.escape', event)
          }
          if (event.key === 'F2') {
            emit('keydown.f2', event)
          }
        },
      }, slots.default?.({ isExpanded: false }))
    },
  }),
  TreeItemLabel: defineComponent({
    name: 'StubTreeItemLabel',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
}

function renderFileTree(props: Record<string, unknown>) {
  const ShortcutHarness = defineComponent({
    name: 'FileTreeShortcutHarness',
    setup() {
      useShortcutDispatcher({
        bindings: [],
        executeContext: {},
        platform: 'windows',
      })

      useShortcutContext({
        commandPanelOpen: false,
        editorMode: 'visual',
        hasSelection: false,
        isDirty: false,
        isModalOpen: false,
        panelFocus: 'none',
        visualType: 'scene',
      })

      return () => h(FileTree as never, props as never)
    },
  })

  return renderInBrowser(ShortcutHarness, {
    global: {
      plugins: [createPinia()],
      stubs: globalStubs,
    },
  })
}

function renderReactiveFileTree(initialProps: Record<string, unknown>) {
  const reactiveProps = reactive({ ...initialProps })

  const ShortcutHarness = defineComponent({
    name: 'ReactiveFileTreeShortcutHarness',
    setup() {
      useShortcutDispatcher({
        bindings: [],
        executeContext: {},
        platform: 'windows',
      })

      useShortcutContext({
        commandPanelOpen: false,
        editorMode: 'visual',
        hasSelection: false,
        isDirty: false,
        isModalOpen: false,
        panelFocus: 'none',
        visualType: 'scene',
      })

      return () => h(FileTree as never, { ...reactiveProps } as never)
    },
  })

  renderInBrowser(ShortcutHarness, {
    global: {
      plugins: [createPinia()],
      stubs: globalStubs,
    },
  })

  return {
    reactiveProps,
  }
}

describe('FileTree', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    handleErrorMock.mockReset()
    renameFileMock.mockReset()
    useModalStoreMock.mockReset()
    useEditorUIStateStoreMock.mockReset()
    useTabsStoreMock.mockReset()
    useWorkspaceStoreMock.mockReset()

    renameFileMock.mockResolvedValue('/project/renamed.txt')
    useModalStoreMock.mockReturnValue({
      open: vi.fn(),
    })
    useEditorUIStateStoreMock.mockReturnValue({
      getFileTreeExpanded: vi.fn(() => []),
      setFileTreeExpanded: vi.fn(),
    })
    useTabsStoreMock.mockReturnValue({
      openTab: vi.fn(),
    })
    useWorkspaceStoreMock.mockReturnValue({
      currentGame: {
        id: 'game-1',
      },
    })
  })

  it('加载中时会显示加载指示', async () => {
    renderFileTree({
      getKey: (item: Record<string, unknown>) => String(item.path),
      isLoading: true,
      items: [],
    })

    await expect.element(page.getByRole('status', { name: 'common.loading' })).toBeInTheDocument()
  })

  it('点击文件项会发出 click 事件', async () => {
    const onClick = vi.fn()

    renderFileTree({
      getKey: (item: Record<string, unknown>) => String(item.path),
      items: [
        {
          name: 'scene.txt',
          path: '/project/scene.txt',
        },
      ],
      onClick,
    })

    await page.getByText('scene.txt').click()

    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({
      value: expect.objectContaining({
        path: '/project/scene.txt',
      }),
    }))
  })

  it('按 F2 重命名后回车会调用 gameFs.renameFile', async () => {
    renderFileTree({
      getKey: (item: Record<string, unknown>) => String(item.path),
      items: [
        {
          name: 'scene.txt',
          path: '/project/scene.txt',
        },
      ],
    })

    const treeItem = page.getByRole('treeitem').first()
    await treeItem.click()
    await userEvent.keyboard('{F2}')

    const textbox = page.getByRole('textbox')
    await textbox.fill('renamed.txt')
    await textbox.click()
    await userEvent.keyboard('{Enter}')

    expect(renameFileMock).toHaveBeenCalledWith('/project/scene.txt', 'renamed.txt')
  })

  it('禁用上下文菜单后，按 F2 不会触发重命名', async () => {
    renderFileTree({
      enableContextMenu: false,
      getKey: (item: Record<string, unknown>) => String(item.path),
      items: [
        {
          name: 'scene.txt',
          path: '/project/scene.txt',
        },
      ],
    })

    const treeItem = page.getByRole('treeitem').first()
    await treeItem.click()
    await userEvent.keyboard('{F2}')

    await expect.element(page.getByRole('textbox')).not.toBeInTheDocument()
    expect(renameFileMock).not.toHaveBeenCalled()
  })

  it('键盘焦点移动到其他条目后，F2 会重命名当前焦点条目', async () => {
    renderFileTree({
      getKey: (item: Record<string, unknown>) => String(item.path),
      items: [
        {
          name: 'first.txt',
          path: '/project/first.txt',
        },
        {
          name: 'second.txt',
          path: '/project/second.txt',
        },
      ],
    })

    const firstTreeItem = page.getByRole('treeitem').nth(0)
    const secondTreeItem = page.getByRole('treeitem').nth(1)

    await firstTreeItem.click()

    const secondTreeItemElement = await secondTreeItem.element()
    secondTreeItemElement.focus()
    await userEvent.keyboard('{F2}')

    const textbox = page.getByRole('textbox')
    await textbox.fill('renamed-second.txt')
    await textbox.click()
    await userEvent.keyboard('{Enter}')

    expect(renameFileMock).toHaveBeenCalledWith('/project/second.txt', 'renamed-second.txt')
  })

  it('按 Delete 会打开删除文件确认弹窗', async () => {
    const modalStore = {
      open: vi.fn(),
    }
    useModalStoreMock.mockReturnValue(modalStore)

    renderFileTree({
      getKey: (item: Record<string, unknown>) => String(item.path),
      items: [
        {
          name: 'scene.txt',
          path: '/project/scene.txt',
        },
      ],
    })

    const treeItem = page.getByRole('treeitem').first()
    await treeItem.click()
    await userEvent.keyboard('{Delete}')

    expect(modalStore.open).toHaveBeenCalledWith('DeleteFileModal', {
      file: {
        isDir: false,
        name: 'scene.txt',
        path: '/project/scene.txt',
      },
    })
  })

  it('禁用上下文菜单后，按 Delete 不会打开删除文件确认弹窗', async () => {
    const modalStore = {
      open: vi.fn(),
    }
    useModalStoreMock.mockReturnValue(modalStore)

    renderFileTree({
      enableContextMenu: false,
      getKey: (item: Record<string, unknown>) => String(item.path),
      items: [
        {
          name: 'scene.txt',
          path: '/project/scene.txt',
        },
      ],
    })

    const treeItem = page.getByRole('treeitem').first()
    await treeItem.click()
    await userEvent.keyboard('{Delete}')

    expect(modalStore.open).not.toHaveBeenCalled()
  })

  it('运行时启用上下文菜单后，F2 会开始触发重命名', async () => {
    const { reactiveProps } = renderReactiveFileTree({
      enableContextMenu: false,
      getKey: (item: Record<string, unknown>) => String(item.path),
      items: [
        {
          name: 'scene.txt',
          path: '/project/scene.txt',
        },
      ],
    })

    const treeItem = page.getByRole('treeitem').first()
    await treeItem.click()

    reactiveProps.enableContextMenu = true
    await nextTick()
    await nextTick()

    await userEvent.keyboard('{F2}')

    await expect.element(page.getByRole('textbox')).toBeInTheDocument()
  })

  it('键盘焦点移动到其他条目后，Delete 会作用到当前焦点条目', async () => {
    const modalStore = {
      open: vi.fn(),
    }
    useModalStoreMock.mockReturnValue(modalStore)

    renderFileTree({
      getKey: (item: Record<string, unknown>) => String(item.path),
      items: [
        {
          name: 'first.txt',
          path: '/project/first.txt',
        },
        {
          name: 'second.txt',
          path: '/project/second.txt',
        },
      ],
    })

    const firstTreeItem = page.getByRole('treeitem').nth(0)
    const secondTreeItem = page.getByRole('treeitem').nth(1)

    await firstTreeItem.click()

    const secondTreeItemElement = await secondTreeItem.element()
    secondTreeItemElement.focus()
    await userEvent.keyboard('{Delete}')

    expect(modalStore.open).toHaveBeenCalledWith('DeleteFileModal', {
      file: {
        isDir: false,
        name: 'second.txt',
        path: '/project/second.txt',
      },
    })
  })
})
