import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, ref } from 'vue'

import { useFileTreeController } from '../useFileTreeController'

interface TestTreeItem extends Record<string, unknown> {
  children?: TestTreeItem[]
  name: string
  path: string
}

const {
  basenameMock,
  createFileMock,
  createFolderMock,
  getFileTreeExpandedMock,
  setFileTreeExpandedMock,
  useEditorUIStateStoreMock,
  useTabsStoreMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  basenameMock: vi.fn(async (filePath: string) => filePath.split(/[/\\]/).at(-1) ?? ''),
  createFileMock: vi.fn(),
  createFolderMock: vi.fn(),
  getFileTreeExpandedMock: vi.fn(),
  setFileTreeExpandedMock: vi.fn(),
  useEditorUIStateStoreMock: vi.fn(),
  useTabsStoreMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/path', () => ({
  basename: basenameMock,
}))

vi.mock('~/services/game-fs', () => ({
  gameFs: {
    createFile: createFileMock,
    createFolder: createFolderMock,
    renameFile: vi.fn(),
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
  handleError: vi.fn(),
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
    children: [{
      name: 'scene.txt',
      path: '/project/scene/scene.txt',
    }],
    name: 'scene',
    path: '/project/scene',
  }]
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
    items,
    scope,
    tabsStore,
  }
}

describe('useFileTreeController 行为', () => {
  beforeEach(() => {
    basenameMock.mockClear()
    createFileMock.mockReset()
    createFolderMock.mockReset()
    getFileTreeExpandedMock.mockReset()
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
