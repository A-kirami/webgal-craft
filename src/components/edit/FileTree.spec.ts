import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'

const {
  handleErrorMock,
  renameFileMock,
  useEditorUIStateStoreMock,
  useTabsStoreMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  handleErrorMock: vi.fn(),
  renameFileMock: vi.fn(),
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
  bind: Record<string, never>
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
    setup(props, { slots }) {
      return () => h('div', slots.default?.({
        flattenItems: flattenItems(
          props.items as FileTreeTestItem[],
          props.getKey as (item: Record<string, unknown>) => string,
        ),
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

describe('FileTree', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    handleErrorMock.mockReset()
    renameFileMock.mockReset()
    useEditorUIStateStoreMock.mockReset()
    useTabsStoreMock.mockReset()
    useWorkspaceStoreMock.mockReset()

    renameFileMock.mockResolvedValue('/project/renamed.txt')
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
    renderInBrowser(FileTree, {
      props: {
        getKey: (item: Record<string, unknown>) => String(item.path),
        isLoading: true,
        items: [],
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('status', { name: 'common.loading' })).toBeInTheDocument()
  })

  it('点击文件项会发出 click 事件', async () => {
    const onClick = vi.fn()

    renderInBrowser(FileTree, {
      props: {
        getKey: (item: Record<string, unknown>) => String(item.path),
        items: [
          {
            name: 'scene.txt',
            path: '/project/scene.txt',
          },
        ],
        onClick,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByText('scene.txt').click()

    expect(onClick).toHaveBeenCalledWith(expect.objectContaining({
      value: expect.objectContaining({
        path: '/project/scene.txt',
      }),
    }))
  })

  it('按 F2 重命名后回车会调用 gameFs.renameFile', async () => {
    renderInBrowser(FileTree, {
      props: {
        getKey: (item: Record<string, unknown>) => String(item.path),
        items: [
          {
            name: 'scene.txt',
            path: '/project/scene.txt',
          },
        ],
      },
      global: {
        stubs: globalStubs,
      },
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
})
