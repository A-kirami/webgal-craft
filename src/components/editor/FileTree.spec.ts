import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { defineComponent, h, nextTick, reactive } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'
import { useShortcutDispatcher } from '~/features/editor/shortcut/useShortcutDispatcher'

const {
  gameFsCopyFileMock,
  handleErrorMock,
  pathOperationPerformMock,
  useModalStoreMock,
  useEditorUIStateStoreMock,
  useTabsStoreMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  gameFsCopyFileMock: vi.fn(),
  handleErrorMock: vi.fn(),
  pathOperationPerformMock: vi.fn(),
  useModalStoreMock: vi.fn(),
  useEditorUIStateStoreMock: vi.fn(),
  useTabsStoreMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

vi.mock('~/services/game-fs', () => ({
  gameFs: {
    copyFile: gameFsCopyFileMock,
    createFile: vi.fn(),
    createFolder: vi.fn(),
  },
}))

vi.mock('~/services/path-operation', () => ({
  pathOperation: {
    perform: pathOperationPerformMock,
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

interface Deferred<T> {
  promise: Promise<T>
  reject: (reason?: unknown) => void
  resolve: (value: T) => void
}

const fileTreeBrowserOptions = {
  messages: {
    'zh-Hans': {
      edit: {
        fileTree: {
          dragPreviewCount: '{count} 个文件',
        },
      },
    },
  },
}

function createPointerEvent(
  type: string,
  options: PointerEventInit & { target?: EventTarget } = {},
): PointerEvent {
  const event = new PointerEvent(type, {
    bubbles: true,
    button: 0,
    buttons: 1,
    cancelable: true,
    clientX: 0,
    clientY: 0,
    isPrimary: true,
    pointerId: 1,
    ...options,
  })
  if (options.target) {
    Object.defineProperty(event, 'target', {
      configurable: true,
      value: options.target,
    })
  }
  return event
}

async function hoverDragTarget(source: HTMLElement, target: HTMLElement): Promise<() => Promise<void>> {
  const elementFromPointMock = vi.spyOn(document, 'elementFromPoint').mockReturnValue(target)

  source.dispatchEvent(createPointerEvent('pointerdown', {
    clientX: 10,
    clientY: 10,
    target: source,
  }))
  source.dispatchEvent(createPointerEvent('pointermove', {
    clientX: 24,
    clientY: 24,
    target: source,
  }))
  target.dispatchEvent(createPointerEvent('pointermove', {
    clientX: 24,
    clientY: 24,
    target,
  }))
  await vi.advanceTimersByTimeAsync(16)
  await nextTick()

  return async () => {
    source.dispatchEvent(createPointerEvent('pointerup', {
      clientX: 24,
      clientY: 24,
      target: source,
    }))
    await Promise.resolve()
    await nextTick()
    elementFromPointMock.mockRestore()
  }
}

async function dragBetweenWithModifier(
  source: HTMLElement,
  target: HTMLElement,
  modifier: Pick<PointerEventInit, 'altKey' | 'ctrlKey' | 'metaKey'>,
): Promise<void> {
  const elementFromPointMock = vi.spyOn(document, 'elementFromPoint').mockReturnValue(target)

  source.dispatchEvent(createPointerEvent('pointerdown', {
    clientX: 10,
    clientY: 10,
    ...modifier,
    target: source,
  }))
  source.dispatchEvent(createPointerEvent('pointermove', {
    clientX: 24,
    clientY: 24,
    ...modifier,
    target: source,
  }))
  target.dispatchEvent(createPointerEvent('pointermove', {
    clientX: 24,
    clientY: 24,
    ...modifier,
    target,
  }))
  await vi.advanceTimersByTimeAsync(16)
  await nextTick()
  source.dispatchEvent(createPointerEvent('pointerup', {
    clientX: 24,
    clientY: 24,
    ...modifier,
    target: source,
  }))
  await Promise.resolve()
  await nextTick()
  elementFromPointMock.mockRestore()
}

async function dragBetween(source: HTMLElement, target: HTMLElement): Promise<void> {
  const finishDrag = await hoverDragTarget(source, target)
  await finishDrag()
}

async function clickWithModifier(
  element: HTMLElement,
  modifier: Pick<MouseEventInit, 'ctrlKey' | 'metaKey' | 'shiftKey'>,
): Promise<void> {
  element.dispatchEvent(new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    ...modifier,
  }))
  await nextTick()
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

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return {
    promise,
    reject,
    resolve,
  }
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
    emits: ['auxclick', 'click', 'clickCapture', 'dblclick', 'keydown.enter', 'keydown.escape', 'keydown.f2', 'pointerdown'],
    setup(_, { attrs, emit, slots }) {
      return () => h('div', {
        ...attrs,
        role: 'treeitem',
        tabIndex: 0,
        onAuxclick: (event: MouseEvent) => emit('auxclick', event),
        onClick: (event: MouseEvent) => emit('click', event),
        onClickCapture: (event: MouseEvent) => emit('clickCapture', event),
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
        onPointerdown: (event: PointerEvent) => emit('pointerdown', event),
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
    browser: fileTreeBrowserOptions,
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
    browser: fileTreeBrowserOptions,
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
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.restoreAllMocks()
    gameFsCopyFileMock.mockReset()
    handleErrorMock.mockReset()
    pathOperationPerformMock.mockReset()
    useModalStoreMock.mockReset()
    useEditorUIStateStoreMock.mockReset()
    useTabsStoreMock.mockReset()
    useWorkspaceStoreMock.mockReset()

    gameFsCopyFileMock.mockResolvedValue('/project/archive/scene.txt')
    pathOperationPerformMock.mockResolvedValue({ cancelled: false, finalPath: '/project/renamed.txt', warnings: [] })
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

  it('外部 selectedItem 变化时会同步文件树高亮', async () => {
    const { reactiveProps } = renderReactiveFileTree({
      getKey: (item: Record<string, unknown>) => String(item.path),
      items: [
        {
          name: 'a.txt',
          path: '/project/a.txt',
        },
        {
          name: 'b.txt',
          path: '/project/b.txt',
        },
      ],
      selectedItem: undefined,
    })

    const first = document.querySelector<HTMLElement>('[data-file-tree-path="/project/a.txt"]')
    const second = document.querySelector<HTMLElement>('[data-file-tree-path="/project/b.txt"]')
    if (!first || !second) {
      throw new TypeError('预期文件树渲染两个文件项')
    }

    expect(first.dataset.fileTreeSelected).toBeUndefined()
    expect(second.dataset.fileTreeSelected).toBeUndefined()

    reactiveProps.selectedItem = {
      name: 'b.txt',
      path: '/project/b.txt',
    }
    await nextTick()

    expect(first.dataset.fileTreeSelected).toBeUndefined()
    expect(second.dataset.fileTreeSelected).toBe('true')
  })

  it('Ctrl 点击会累加选中，拖拽已选中项时会移动整个选中集合', async () => {
    vi.useFakeTimers()
    const onClick = vi.fn()
    renderFileTree({
      enableDragTransfer: true,
      getKey: (item: Record<string, unknown>) => String(item.path),
      items: [
        {
          name: 'a.txt',
          path: '/project/a.txt',
        },
        {
          name: 'b.txt',
          path: '/project/b.txt',
        },
        {
          name: 'target',
          path: '/project/target',
          children: [],
        },
      ],
      onClick,
      rootPath: '/project',
    })

    const first = document.querySelector<HTMLElement>('[data-file-tree-path="/project/a.txt"]')
    const second = document.querySelector<HTMLElement>('[data-file-tree-path="/project/b.txt"]')
    const target = document.querySelector<HTMLElement>('[data-file-tree-path="/project/target"]')
    if (!first || !second || !target) {
      throw new TypeError('预期文件树渲染两个源文件和目标目录')
    }

    await clickWithModifier(first, { ctrlKey: true })
    await clickWithModifier(second, { ctrlKey: true })

    expect(first.dataset.fileTreeSelected).toBe('true')
    expect(second.dataset.fileTreeSelected).toBe('true')
    expect(onClick).not.toHaveBeenCalled()

    const finishDrag = await hoverDragTarget(first, target)
    const dragPreview = page.getByTestId('file-tree-drag-preview')

    await expect.element(dragPreview.getByText('a.txt')).toBeInTheDocument()
    await expect.element(dragPreview.getByText('2 个文件')).toBeInTheDocument()

    await finishDrag()

    expect(pathOperationPerformMock).toHaveBeenNthCalledWith(1, {
      kind: 'move',
      sourcePath: '/project/a.txt',
      target: { type: 'directory', directory: '/project/target' },
    }, expect.any(Function))
    expect(pathOperationPerformMock).toHaveBeenNthCalledWith(2, {
      kind: 'move',
      sourcePath: '/project/b.txt',
      target: { type: 'directory', directory: '/project/target' },
    }, expect.any(Function))
  })

  it('拖拽集合包含祖先目录时会忽略其子项，避免重复移动失效路径', async () => {
    vi.useFakeTimers()
    renderFileTree({
      enableDragTransfer: true,
      getKey: (item: Record<string, unknown>) => String(item.path),
      items: [
        {
          children: [
            {
              name: 'branch.txt',
              path: '/project/chapter/branch.txt',
            },
          ],
          name: 'chapter',
          path: '/project/chapter',
        },
        {
          name: 'target',
          path: '/project/target',
          children: [],
        },
      ],
      rootPath: '/project',
    })

    const directory = document.querySelector<HTMLElement>('[data-file-tree-path="/project/chapter"]')
    const child = document.querySelector<HTMLElement>('[data-file-tree-path="/project/chapter/branch.txt"]')
    const target = document.querySelector<HTMLElement>('[data-file-tree-path="/project/target"]')
    if (!directory || !child || !target) {
      throw new TypeError('预期文件树渲染父目录、子文件和目标目录')
    }

    await clickWithModifier(directory, { ctrlKey: true })
    await clickWithModifier(child, { ctrlKey: true })
    await dragBetween(directory, target)

    expect(pathOperationPerformMock).toHaveBeenCalledTimes(1)
    expect(pathOperationPerformMock).toHaveBeenCalledWith({
      kind: 'move',
      sourcePath: '/project/chapter',
      target: { type: 'directory', directory: '/project/target' },
    }, expect.any(Function))
  })

  it('Ctrl 点击已选中项会取消选中并从拖拽集合中移除', async () => {
    vi.useFakeTimers()
    renderFileTree({
      enableDragTransfer: true,
      getKey: (item: Record<string, unknown>) => String(item.path),
      items: [
        {
          name: 'a.txt',
          path: '/project/a.txt',
        },
        {
          name: 'b.txt',
          path: '/project/b.txt',
        },
        {
          name: 'target',
          path: '/project/target',
          children: [],
        },
      ],
      rootPath: '/project',
    })

    const first = document.querySelector<HTMLElement>('[data-file-tree-path="/project/a.txt"]')
    const second = document.querySelector<HTMLElement>('[data-file-tree-path="/project/b.txt"]')
    const target = document.querySelector<HTMLElement>('[data-file-tree-path="/project/target"]')
    if (!first || !second || !target) {
      throw new TypeError('预期文件树渲染两个源文件和目标目录')
    }

    await clickWithModifier(first, { ctrlKey: true })
    await clickWithModifier(second, { ctrlKey: true })
    await clickWithModifier(first, { ctrlKey: true })

    expect(first.dataset.fileTreeSelected).toBeUndefined()
    expect(second.dataset.fileTreeSelected).toBe('true')

    await dragBetween(second, target)

    expect(pathOperationPerformMock).toHaveBeenCalledTimes(1)
    expect(pathOperationPerformMock).toHaveBeenCalledWith({
      kind: 'move',
      sourcePath: '/project/b.txt',
      target: { type: 'directory', directory: '/project/target' },
    }, expect.any(Function))
  })

  it('Shift 点击会按当前可见顺序范围选中并支持拖拽整个范围', async () => {
    vi.useFakeTimers()
    const onClick = vi.fn()
    renderFileTree({
      enableDragTransfer: true,
      getKey: (item: Record<string, unknown>) => String(item.path),
      items: [
        {
          name: 'a.txt',
          path: '/project/a.txt',
        },
        {
          name: 'b.txt',
          path: '/project/b.txt',
        },
        {
          name: 'c.txt',
          path: '/project/c.txt',
        },
        {
          name: 'target',
          path: '/project/target',
          children: [],
        },
      ],
      onClick,
      rootPath: '/project',
    })

    const first = document.querySelector<HTMLElement>('[data-file-tree-path="/project/a.txt"]')
    const second = document.querySelector<HTMLElement>('[data-file-tree-path="/project/b.txt"]')
    const third = document.querySelector<HTMLElement>('[data-file-tree-path="/project/c.txt"]')
    const target = document.querySelector<HTMLElement>('[data-file-tree-path="/project/target"]')
    if (!first || !second || !third || !target) {
      throw new TypeError('预期文件树渲染三个源文件和目标目录')
    }

    await page.getByText('a.txt').click()
    await clickWithModifier(third, { shiftKey: true })

    expect(first.dataset.fileTreeSelected).toBe('true')
    expect(second.dataset.fileTreeSelected).toBe('true')
    expect(third.dataset.fileTreeSelected).toBe('true')

    await dragBetween(second, target)

    expect(pathOperationPerformMock).toHaveBeenNthCalledWith(1, {
      kind: 'move',
      sourcePath: '/project/a.txt',
      target: { type: 'directory', directory: '/project/target' },
    }, expect.any(Function))
    expect(pathOperationPerformMock).toHaveBeenNthCalledWith(2, {
      kind: 'move',
      sourcePath: '/project/b.txt',
      target: { type: 'directory', directory: '/project/target' },
    }, expect.any(Function))
    expect(pathOperationPerformMock).toHaveBeenNthCalledWith(3, {
      kind: 'move',
      sourcePath: '/project/c.txt',
      target: { type: 'directory', directory: '/project/target' },
    }, expect.any(Function))
  })

  it('按 F2 重命名后回车会调用 pathOperation.perform', async () => {
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

    expect(pathOperationPerformMock).toHaveBeenCalledWith({
      kind: 'rename',
      sourcePath: '/project/scene.txt',
      target: { type: 'name', name: 'renamed.txt' },
    }, expect.any(Function))
  })

  it('重命名成功后会保持输入态直到父层 items 反映新路径', async () => {
    const renameDeferred = createDeferred<{
      cancelled: boolean
      finalPath: string
      warnings: never[]
    }>()
    pathOperationPerformMock.mockReturnValueOnce(renameDeferred.promise)

    const { reactiveProps } = renderReactiveFileTree({
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

    await expect.element(page.getByRole('textbox')).toBeInTheDocument()

    renameDeferred.resolve({
      cancelled: false,
      finalPath: '/project/renamed.txt',
      warnings: [],
    })
    await Promise.resolve()
    await nextTick()

    await expect.element(page.getByRole('textbox')).toBeInTheDocument()

    reactiveProps.items = [
      {
        name: 'renamed.txt',
        path: '/project/renamed.txt',
      },
    ]
    await nextTick()

    await expect.element(page.getByRole('textbox')).not.toBeInTheDocument()
    await expect.element(page.getByText('renamed.txt')).toBeInTheDocument()
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
    expect(pathOperationPerformMock).not.toHaveBeenCalled()
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

    expect(pathOperationPerformMock).toHaveBeenCalledWith({
      kind: 'rename',
      sourcePath: '/project/second.txt',
      target: { type: 'name', name: 'renamed-second.txt' },
    }, expect.any(Function))
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

  it('拖拽文件到目录时会悬停展开并通过 pathOperation.perform 移动', async () => {
    vi.useFakeTimers()
    const setFileTreeExpandedMock = vi.fn()
    useEditorUIStateStoreMock.mockReturnValue({
      getFileTreeExpanded: vi.fn(() => []),
      setFileTreeExpanded: setFileTreeExpandedMock,
    })
    renderFileTree({
      enableDragTransfer: true,
      getKey: (item: Record<string, unknown>) => String(item.path),
      items: [
        {
          name: 'archive',
          path: '/project/archive',
          children: [],
        },
        {
          name: 'scene.txt',
          path: '/project/scene.txt',
        },
      ],
      rootPath: '/project',
      treeName: 'scene',
    })

    const source = document.querySelector<HTMLElement>('[data-file-tree-path="/project/scene.txt"]')
    const target = document.querySelector<HTMLElement>('[data-file-tree-path="/project/archive"]')
    if (!source || !target) {
      throw new TypeError('预期文件树渲染源文件和目标目录')
    }

    const finishDrag = await hoverDragTarget(source, target)

    await vi.advanceTimersByTimeAsync(800)
    await nextTick()
    expect(setFileTreeExpandedMock).toHaveBeenCalledWith('game-1', 'scene', ['/project/archive'])

    await finishDrag()

    expect(pathOperationPerformMock).toHaveBeenCalledWith({
      kind: 'move',
      sourcePath: '/project/scene.txt',
      target: { type: 'directory', directory: '/project/archive' },
    }, expect.any(Function))
    await expect.element(page.getByText('scene.txt')).toBeInTheDocument()
  })

  it('按住 Ctrl 拖拽文件到目录时会复制而不是移动', async () => {
    vi.useFakeTimers()
    renderFileTree({
      enableDragTransfer: true,
      getKey: (item: Record<string, unknown>) => String(item.path),
      items: [
        {
          name: 'archive',
          path: '/project/archive',
          children: [],
        },
        {
          name: 'scene.txt',
          path: '/project/scene.txt',
        },
      ],
      rootPath: '/project',
    })

    const source = document.querySelector<HTMLElement>('[data-file-tree-path="/project/scene.txt"]')
    const target = document.querySelector<HTMLElement>('[data-file-tree-path="/project/archive"]')
    if (!source || !target) {
      throw new TypeError('预期文件树渲染源文件和目标目录')
    }

    await dragBetweenWithModifier(source, target, { ctrlKey: true })

    expect(gameFsCopyFileMock).toHaveBeenCalledWith('/project/scene.txt', '/project/archive')
    expect(pathOperationPerformMock).not.toHaveBeenCalled()
  })

  it('拖拽文件到展开目录中的子文件时会以父目录为目标', async () => {
    vi.useFakeTimers()
    renderFileTree({
      enableDragTransfer: true,
      getKey: (item: Record<string, unknown>) => String(item.path),
      items: [
        {
          name: 'archive',
          path: '/project/archive',
          children: [
            {
              name: 'existing.txt',
              path: '/project/archive/existing.txt',
            },
          ],
        },
        {
          name: 'scene.txt',
          path: '/project/scene.txt',
        },
      ],
      rootPath: '/project',
    })

    const source = document.querySelector<HTMLElement>('[data-file-tree-path="/project/scene.txt"]')
    const target = document.querySelector<HTMLElement>('[data-file-tree-path="/project/archive/existing.txt"]')
    if (!source || !target) {
      throw new TypeError('预期文件树渲染源文件、目录和目录中的目标文件')
    }

    const finishDrag = await hoverDragTarget(source, target)

    await finishDrag()

    expect(pathOperationPerformMock).toHaveBeenCalledWith({
      kind: 'move',
      sourcePath: '/project/scene.txt',
      target: { type: 'directory', directory: '/project/archive' },
    }, expect.any(Function))
  })

  it('拖拽目录到它的父目录时不会调用 pathOperation.perform', async () => {
    vi.useFakeTimers()
    renderFileTree({
      enableDragTransfer: true,
      getKey: (item: Record<string, unknown>) => String(item.path),
      items: [
        {
          name: 'chapter',
          path: '/project/chapter',
          children: [
            {
              name: 'branch',
              path: '/project/chapter/branch/',
              children: [],
            },
          ],
        },
      ],
      rootPath: '/project',
    })

    const source = document.querySelector<HTMLElement>('[data-file-tree-path="/project/chapter/branch/"]')
    const target = document.querySelector<HTMLElement>('[data-file-tree-path="/project/chapter"]')
    if (!source || !target) {
      throw new TypeError('预期文件树渲染源目录和父目录')
    }

    await dragBetween(source, target)

    expect(pathOperationPerformMock).not.toHaveBeenCalled()
  })

  it('父子目录间连续反向拖拽时会使用更新后的源路径和目标目录', async () => {
    vi.useFakeTimers()
    const { reactiveProps } = renderReactiveFileTree({
      enableDragTransfer: true,
      getKey: (item: Record<string, unknown>) => String(item.path),
      items: [
        {
          name: 'chapter',
          path: '/project/chapter',
          children: [],
        },
        {
          name: 'scene.txt',
          path: '/project/scene.txt',
        },
      ],
      rootPath: '/project',
    })

    const firstSource = document.querySelector<HTMLElement>('[data-file-tree-path="/project/scene.txt"]')
    const firstTarget = document.querySelector<HTMLElement>('[data-file-tree-path="/project/chapter"]')
    if (!firstSource || !firstTarget) {
      throw new TypeError('预期文件树渲染父目录源文件和子目录目标')
    }

    await dragBetween(firstSource, firstTarget)
    expect(pathOperationPerformMock).toHaveBeenLastCalledWith({
      kind: 'move',
      sourcePath: '/project/scene.txt',
      target: { type: 'directory', directory: '/project/chapter' },
    }, expect.any(Function))

    reactiveProps.items = [
      {
        name: 'chapter',
        path: '/project/chapter',
        children: [
          {
            name: 'scene.txt',
            path: '/project/chapter/scene.txt',
          },
        ],
      },
      {
        name: 'readme.txt',
        path: '/project/readme.txt',
      },
    ]
    await nextTick()

    const secondSource = document.querySelector<HTMLElement>('[data-file-tree-path="/project/chapter/scene.txt"]')
    const secondTarget = document.querySelector<HTMLElement>('[data-file-tree-path="/project/readme.txt"]')
    if (!secondSource || !secondTarget) {
      throw new TypeError('预期文件树渲染子目录源文件和根目录目标文件')
    }

    await dragBetween(secondSource, secondTarget)
    expect(pathOperationPerformMock).toHaveBeenLastCalledWith({
      kind: 'move',
      sourcePath: '/project/chapter/scene.txt',
      target: { type: 'directory', directory: '/project' },
    }, expect.any(Function))
    expect(pathOperationPerformMock).toHaveBeenCalledTimes(2)
  })

  it('拖拽到文件行时不会触发移动', async () => {
    vi.useFakeTimers()
    renderFileTree({
      enableDragTransfer: true,
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
      rootPath: '/project',
    })

    const source = document.querySelector<HTMLElement>('[data-file-tree-path="/project/first.txt"]')
    const target = document.querySelector<HTMLElement>('[data-file-tree-path="/project/second.txt"]')
    if (!source || !target) {
      throw new TypeError('预期文件树渲染两个文件项')
    }

    await dragBetween(source, target)

    expect(pathOperationPerformMock).not.toHaveBeenCalled()
  })
})
