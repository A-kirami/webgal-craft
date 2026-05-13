import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, ref } from 'vue'

import { useFileSystemEvents } from '~/composables/useFileSystemEvents'
import { AbsPath } from '~/domain/path'
import { pathOperation } from '~/services/path-operation'

import { useFileTreeController } from '../useFileTreeController'

interface TestTreeItem extends Record<string, unknown> {
  children?: TestTreeItem[]
  name: string
  path: string
}

interface TestFlattenedItem {
  _id: string
  bind: Record<string, unknown> & {
    level: number
    value: TestTreeItem
  }
  hasChildren: boolean
  index: number
  level: number
  value: TestTreeItem
}

const {
  createFileMock,
  createFolderMock,
  fileSystemEventOnMock,
  getFileTreeExpandedMock,
  setFileTreeExpandedMock,
  useEditorUIStateStoreMock,
  useTabsStoreMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  createFileMock: vi.fn(),
  createFolderMock: vi.fn(),
  fileSystemEventOnMock: vi.fn(),
  getFileTreeExpandedMock: vi.fn(),
  setFileTreeExpandedMock: vi.fn(),
  useEditorUIStateStoreMock: vi.fn(),
  useTabsStoreMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

vi.mock('~/services/game-fs', () => ({
  gameFs: {
    createFile: createFileMock,
    createFolder: createFolderMock,
  },
}))

vi.mock('~/services/path-operation', () => ({
  pathOperation: {
    perform: vi.fn(),
  },
}))

vi.mock('~/services/path-operation-confirm', () => ({
  createPathOperationRewriteConfirm: vi.fn(() => vi.fn(async () => 'rewrite')),
}))

vi.mock('~/composables/useFileSystemEvents', () => ({
  useFileSystemEvents: vi.fn(),
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
  handleError: vi.fn(),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
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
}))

function createItems(): TestTreeItem[] {
  return [{
    name: 'scene',
    path: '/project/scene',
    children: [{
      children: [{
        name: 'scene.txt',
        path: '/project/scene/chapter/scene.txt',
      }],
      name: 'chapter',
      path: '/project/scene/chapter',
    }],
  }]
}

function createFlattenedItem(
  value: TestTreeItem,
  options: {
    hasChildren: boolean
    level: number
  },
): TestFlattenedItem {
  return {
    _id: value.path,
    bind: {
      level: options.level,
      value,
    },
    hasChildren: options.hasChildren,
    index: 0,
    level: options.level,
    value,
  }
}

function createFixture(options: {
  defaultExpanded?: string[]
  defaultFileNameParts?: {
    extension?: string
    stem: string
  }
  openCreatedFileInTab?: boolean
  savedExpanded?: string[]
} = {}) {
  const items = reactive(createItems())
  const tabsStore = {
    openTab: vi.fn(),
  }

  getFileTreeExpandedMock.mockReturnValue(options.savedExpanded ?? [])
  const eventHandlers = new Map<string, (event: Record<string, unknown>) => void>()
  fileSystemEventOnMock.mockImplementation((eventType: string, handler: (event: Record<string, unknown>) => void) => {
    eventHandlers.set(eventType, handler)
    return vi.fn(() => {
      eventHandlers.delete(eventType)
    })
  })
  vi.mocked(useFileSystemEvents).mockReturnValue({
    emit: vi.fn(),
    on: fileSystemEventOnMock,
    reset: vi.fn(),
  } as ReturnType<typeof useFileSystemEvents>)
  useEditorUIStateStoreMock.mockReturnValue({
    getFileTreeExpanded: getFileTreeExpandedMock,
    setFileTreeExpanded: setFileTreeExpandedMock,
  })
  useTabsStoreMock.mockReturnValue(tabsStore)
  useWorkspaceStoreMock.mockReturnValue({
    currentGame: {
      id: 'game-1',
    },
  })

  const scope = effectScope()
  const controller = scope.run(() => useFileTreeController<TestTreeItem>({
    creatingInputRef: ref(),
    defaultExpanded: () => options.defaultExpanded ?? [],
    defaultFileNameParts: options.defaultFileNameParts,
    defaultFileNamePartsFallback: () => ({
      extension: '.txt',
      stem: 'untitled',
    }),
    defaultFolderName: () => 'untitled-folder',
    fileTreeContainerRef: ref(),
    getKey: item => item.path,
    inputRef: ref(),
    items: () => items,
    nameField: 'name',
    openCreatedFileInTab: () => options.openCreatedFileInTab ?? false,
    scrollAreaRef: ref(),
    sortBy: () => 'name',
    sortOrder: () => 'asc',
    treeName: () => 'scene',
  }))

  if (!controller) {
    throw new TypeError('预期返回 file tree controller')
  }

  return {
    controller,
    eventHandlers,
    items,
    scope,
    tabsStore,
  }
}

describe('useFileTreeController', () => {
  beforeEach(() => {
    createFileMock.mockReset()
    createFolderMock.mockReset()
    fileSystemEventOnMock.mockReset()
    getFileTreeExpandedMock.mockReset()
    vi.mocked(pathOperation.perform).mockReset()
    setFileTreeExpandedMock.mockReset()
    useEditorUIStateStoreMock.mockReset()
    useTabsStoreMock.mockReset()
    useWorkspaceStoreMock.mockReset()
  })

  it('会优先恢复当前项目对应的展开状态并在变更后持久化', async () => {
    const { controller, scope } = createFixture({
      defaultExpanded: ['/project/default'],
      savedExpanded: ['/project/saved'],
    })

    expect(controller.expanded.value).toEqual(['/project/saved'])

    controller.expanded.value = ['/project/scene']
    await nextTick()

    expect(setFileTreeExpandedMock).toHaveBeenCalledWith('game-1', 'scene', ['/project/scene'])

    scope.stop()
  })

  it('开始创建文件时会先展开父目录并写入默认文件名', () => {
    const { controller, scope } = createFixture()

    controller.startCreating('/project/scene', 'file')

    expect(controller.expanded.value).toContain('/project/scene')
    expect(controller.createState.value).toMatchObject({
      parentPath: '/project/scene',
      type: 'file',
      value: 'untitled.txt',
    })

    scope.stop()
  })

  it('目录重命名后会迁移已展开的目录路径', async () => {
    const { controller, eventHandlers, items, scope } = createFixture({
      savedExpanded: ['/project/scene', '/project/scene/chapter'],
    })

    eventHandlers.get('directory:renamed')?.({
      newPath: '/project/scene/chapter-renamed',
      oldPath: '/project/scene/chapter',
      type: 'directory:renamed',
    })
    await nextTick()

    expect(controller.expanded.value).toEqual([
      '/project/scene',
      '/project/scene/chapter',
    ])

    items[0].children = [{
      children: [{
        name: 'scene.txt',
        path: '/project/scene/chapter-renamed/scene.txt',
      }],
      name: 'chapter-renamed',
      path: '/project/scene/chapter-renamed',
    }]
    await nextTick()

    expect(controller.expanded.value).toEqual([
      '/project/scene',
      '/project/scene/chapter-renamed',
    ])
    expect(setFileTreeExpandedMock).toHaveBeenLastCalledWith('game-1', 'scene', [
      '/project/scene',
      '/project/scene/chapter-renamed',
    ])

    scope.stop()
  })

  it('重命名成功后会保持重命名态直到 items 反映新路径', async () => {
    vi.mocked(pathOperation.perform).mockResolvedValueOnce({
      cancelled: false,
      finalPath: AbsPath.from('/project/scene/chapter/renamed.txt'),
      plan: {} as never,
      warnings: [],
    })
    const { controller, items, scope } = createFixture()
    const renamedItem = createFlattenedItem(items[0].children![0]!.children![0]!, {
      hasChildren: false,
      level: 3,
    })

    if (!renamedItem) {
      throw new TypeError('预期存在待重命名的文件项')
    }

    controller.itemMap.set('/project/scene/chapter/scene.txt', renamedItem)
    controller.handleContextMenuRename({ path: '/project/scene/chapter/scene.txt' })
    await nextTick()

    controller.renameState.value.value = 'renamed.txt'
    await controller.handleRename(renamedItem)

    expect(controller.renameState.value).toMatchObject({
      isInProgress: true,
      itemKey: '/project/scene/chapter/scene.txt',
      value: 'renamed.txt',
    })

    items[0].children![0]!.children = [{
      name: 'renamed.txt',
      path: '/project/scene/chapter/renamed.txt',
    }]
    await nextTick()

    expect(controller.renameState.value).toMatchObject({
      isInProgress: false,
      itemKey: undefined,
      value: '',
    })

    scope.stop()
  })

  it('创建固定后缀文件时会把 stem 和 extension 组装成完整文件名', () => {
    const { controller, scope } = createFixture({
      defaultFileNameParts: {
        extension: '.txt',
        stem: '',
      },
    })

    controller.startCreating('/project/scene', 'file')

    expect(controller.createState.value).toMatchObject({
      parentPath: '/project/scene',
      type: 'file',
      value: '.txt',
    })

    scope.stop()
  })

  it('创建文件成功后会按配置自动打开新标签页', async () => {
    createFileMock.mockResolvedValue('/project/scene/new-scene.txt')
    const { controller, scope, tabsStore } = createFixture({
      openCreatedFileInTab: true,
    })

    controller.createState.value = {
      isInProgress: false,
      isStarting: false,
      parentPath: '/project/scene',
      type: 'file',
      value: 'new-scene.txt',
    }

    await controller.handleCreate()

    expect(createFileMock).toHaveBeenCalledWith('/project/scene', 'new-scene.txt')
    expect(tabsStore.openTab).toHaveBeenCalledWith('new-scene.txt', '/project/scene/new-scene.txt', {
      focus: true,
      forceNormal: true,
    })
    expect(controller.createState.value).toMatchObject({
      parentPath: undefined,
      type: undefined,
      value: '',
    })

    scope.stop()
  })
})
