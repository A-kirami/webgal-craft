import { describe, expect, it } from 'vitest'

import {
  canCopyFileTreeItemsToDirectory,
  canDropFileTreeTransferItemsToDirectory,
  canDropFileTreeTransferPayloadToDirectory,
  canMoveFileTreeItemsToDirectory,
  getFileTreeNameSelectionEnd,
  getFileTreeTransferPayloadItems,
  hasFileTreeDuplicateName,
  insertCreatingFileTreeItem,
  normalizeFileTreeTransferItems,
  resolveDroppableFileTreeTransferItems,
  resolveFileTreeCreateBlurAction,
  resolveFileTreeCreateStart,
  resolveFileTreeRenameBlurAction,
  rewriteExpandedKeysForDirectoryRename,
} from '../file-tree'

import type { FileTreeBlurAction } from '../file-tree'

interface TestTreeItem {
  children?: TestTreeItem[]
  name: string
  path: string
}

interface TestFlattenedItem {
  _id: string
  hasChildren: boolean
  level: number
  value: TestTreeItem
}

function createFlattenedItem(
  path: string,
  name: string,
  level: number,
  hasChildren: boolean,
): TestFlattenedItem {
  return {
    _id: path,
    hasChildren,
    level,
    value: {
      path,
      name,
      ...(hasChildren ? { children: [] } : {}),
    },
  }
}

describe('fileTree', () => {
  it('计算重命名时的默认选区结束位置', () => {
    expect(getFileTreeNameSelectionEnd('scene.txt', false)).toBe(5)
    expect(getFileTreeNameSelectionEnd('.gitignore', false)).toBe(10)
    expect(getFileTreeNameSelectionEnd('chapter-1', true)).toBe(9)
  })

  it('判断同级文件名重复时会忽略大小写、首尾空白和当前项', () => {
    const items: TestTreeItem[] = [
      {
        name: 'chapter',
        path: '/project/chapter',
        children: [
          {
            name: ' Scene.txt ',
            path: '/project/chapter/Scene.txt',
          },
          {
            name: 'branch.txt',
            path: '/project/chapter/branch.txt',
          },
        ],
      },
    ]

    expect(hasFileTreeDuplicateName(items, {
      getChildren: item => item.children,
      getName: item => item.name,
      getPath: item => item.path,
    }, '/project/chapter', ' scene.TXT ')).toBe(true)

    expect(hasFileTreeDuplicateName(items, {
      getChildren: item => item.children,
      getName: item => item.name,
      getPath: item => item.path,
    }, '/project/chapter', ' scene.TXT ', '/project/chapter/Scene.txt')).toBe(false)
  })

  it('目录重命名时会迁移展开状态中的目录前缀并保持原顺序', () => {
    expect(rewriteExpandedKeysForDirectoryRename([
      '/project/chapter',
      '/project/chapter/branch',
      '/project/scene',
      '/project/chapter',
    ], '/project/chapter', '/project/chapter-renamed')).toEqual([
      '/project/chapter-renamed',
      '/project/chapter-renamed/branch',
      '/project/scene',
    ])
  })

  it('在根目录创建文件时会插入到根级文件前而不是目录前', () => {
    const flattenItems: TestFlattenedItem[] = [
      createFlattenedItem('/project/chapter', 'chapter', 1, true),
      createFlattenedItem('/project/scene.txt', 'scene.txt', 1, false),
    ]

    const result = insertCreatingFileTreeItem<TestTreeItem, TestFlattenedItem>(flattenItems, {
      createItem: (parentPath, type, parentLevel) => createFlattenedItem(
        `__creating__${parentPath}${type}`,
        '',
        parentLevel + 1,
        type === 'folder',
      ),
      creation: {
        parentPath: '/project',
        type: 'file',
      },
      getItemPath: item => item.path,
    })

    expect(result.map(item => item._id)).toEqual([
      '/project/chapter',
      '__creating__/projectfile',
      '/project/scene.txt',
    ])
  })

  it('在目录内创建文件夹时会插入到该目录直接子项的最前面', () => {
    const flattenItems: TestFlattenedItem[] = [
      createFlattenedItem('/project/chapter', 'chapter', 1, true),
      createFlattenedItem('/project/chapter/scene.txt', 'scene.txt', 2, false),
      createFlattenedItem('/project/chapter/branch.txt', 'branch.txt', 2, false),
      createFlattenedItem('/project/root.txt', 'root.txt', 1, false),
    ]

    const result = insertCreatingFileTreeItem<TestTreeItem, TestFlattenedItem>(flattenItems, {
      createItem: (parentPath, type, parentLevel) => createFlattenedItem(
        `__creating__${parentPath}${type}`,
        '',
        parentLevel + 1,
        type === 'folder',
      ),
      creation: {
        parentPath: '/project/chapter',
        type: 'folder',
      },
      getItemPath: item => item.path,
    })

    expect(result.map(item => item._id)).toEqual([
      '/project/chapter',
      '__creating__/project/chapterfolder',
      '/project/chapter/scene.txt',
      '/project/chapter/branch.txt',
      '/project/root.txt',
    ])
  })

  it('重命名 blur 时在启动阶段或目标项已变化时不做处理', () => {
    expect(resolveFileTreeRenameBlurAction({
      currentItemKey: '/project/scene.txt',
      currentValue: 'renamed.txt',
      isStarting: true,
      originalName: 'scene.txt',
      renamingItemKey: '/project/scene.txt',
    })).toBe('noop')

    expect(resolveFileTreeRenameBlurAction({
      currentItemKey: '/project/scene.txt',
      currentValue: 'renamed.txt',
      isStarting: false,
      originalName: 'scene.txt',
      renamingItemKey: '/project/other.txt',
    })).toBe('noop')
  })

  it('重命名 blur 时空值会取消重命名', () => {
    expect(resolveFileTreeRenameBlurAction({
      currentItemKey: '/project/scene.txt',
      currentValue: '   ',
      isStarting: false,
      originalName: 'scene.txt',
      renamingItemKey: '/project/scene.txt',
    })).toBe('cancel')
  })

  it('重命名 blur 时未改名会取消重命名', () => {
    expect(resolveFileTreeRenameBlurAction({
      currentItemKey: '/project/scene.txt',
      currentValue: ' scene.txt ',
      isStarting: false,
      originalName: 'scene.txt',
      renamingItemKey: '/project/scene.txt',
    })).toBe('cancel')
  })

  it('重命名 blur 时有效新名称会提交重命名', () => {
    expect(resolveFileTreeRenameBlurAction({
      currentItemKey: '/project/scene.txt',
      currentValue: 'renamed.txt',
      isStarting: false,
      originalName: 'scene.txt',
      renamingItemKey: '/project/scene.txt',
    })).toBe('submit')
  })

  it('开始创建文件时会返回默认名、光标位置和待展开父节点', () => {
    const items: TestTreeItem[] = [
      {
        children: [
          {
            name: 'scene.txt',
            path: '/project/chapter/scene.txt',
          },
        ],
        name: 'chapter',
        path: '/project/chapter',
      },
    ]

    expect(resolveFileTreeCreateStart({
      accessor: {
        getChildren: item => item.children,
        getPath: item => item.path,
      },
      defaultFileNameParts: {
        extension: '.txt',
        stem: 'new-scene',
      },
      defaultFolderName: 'new-folder',
      getKey: item => item.path,
      items,
      parentPath: '/project/chapter',
      type: 'file',
    })).toEqual({
      expandParentKey: '/project/chapter',
      selectionEnd: 9,
      value: 'new-scene.txt',
    })
  })

  it('开始创建固定后缀文件时会只选中 stem 部分', () => {
    expect(resolveFileTreeCreateStart({
      accessor: {
        getChildren: item => item.children,
        getPath: item => item.path,
      },
      defaultFileNameParts: {
        extension: '.txt',
        stem: '',
      },
      defaultFolderName: '新建文件夹',
      getKey: item => item.path,
      items: [] as TestTreeItem[],
      parentPath: '/project',
      type: 'file',
    })).toEqual({
      selectionEnd: 0,
      value: '.txt',
    })
  })

  it('开始创建文件夹时会全选默认文件夹名', () => {
    const items: TestTreeItem[] = [
      {
        name: 'scene.txt',
        path: '/project/scene.txt',
      },
    ]

    expect(resolveFileTreeCreateStart({
      accessor: {
        getChildren: item => item.children,
        getPath: item => item.path,
      },
      defaultFileNameParts: {
        extension: '.txt',
        stem: 'new-scene',
      },
      defaultFolderName: '新建文件夹',
      getKey: item => item.path,
      items,
      parentPath: '/project',
      type: 'folder',
    })).toEqual({
      selectionEnd: 5,
      value: '新建文件夹',
    })
  })

  it('创建 blur 时默认名或空值会取消创建', () => {
    expect(resolveFileTreeCreateBlurAction({
      defaultFileNameParts: {
        extension: '.txt',
        stem: 'new-scene',
      },
      defaultFolderName: '新建文件夹',
      isStarting: false,
      parentPath: '/project',
      type: 'file',
      value: ' new-scene.txt ',
    })).toBe('cancel')

    expect(resolveFileTreeCreateBlurAction({
      defaultFileNameParts: {
        extension: '.txt',
        stem: 'new-scene',
      },
      defaultFolderName: '新建文件夹',
      isStarting: false,
      parentPath: '/project',
      type: 'folder',
      value: '   ',
    })).toBe('cancel')
  })

  it('创建 blur 时有效名称会提交创建', () => {
    expect(resolveFileTreeCreateBlurAction({
      defaultFileNameParts: {
        extension: '.txt',
        stem: 'new-scene',
      },
      defaultFolderName: '新建文件夹',
      isStarting: false,
      parentPath: '/project',
      type: 'file',
      value: 'branch.txt',
    })).toBe<FileTreeBlurAction>('submit')
  })

  describe('文件移动目标', () => {
    it('会拒绝拖入自身、子目录和同父目录', () => {
      expect(canMoveFileTreeItemsToDirectory({
        sourcePaths: ['/project/scene/chapter'],
        targetDirectoryPath: '/project/scene/chapter',
      })).toBe(false)

      expect(canMoveFileTreeItemsToDirectory({
        sourcePaths: ['/project/scene/chapter'],
        targetDirectoryPath: '/project/scene/chapter/nested',
      })).toBe(false)

      expect(canMoveFileTreeItemsToDirectory({
        sourcePaths: ['/project/scene/start.txt'],
        targetDirectoryPath: '/project/scene',
      })).toBe(false)

      expect(canMoveFileTreeItemsToDirectory({
        sourcePaths: [String.raw`C:\project\scene\chapter`],
        targetDirectoryPath: 'C:/project/scene',
      })).toBe(false)

      expect(canMoveFileTreeItemsToDirectory({
        sourcePaths: ['/project/scene/chapter/'],
        targetDirectoryPath: '/project/scene',
      })).toBe(false)
    })

    it('所有来源都可以移动时才允许放置', () => {
      expect(canMoveFileTreeItemsToDirectory({
        sourcePaths: ['/project/scene/start.txt', '/project/scene/chapter'],
        targetDirectoryPath: '/project/scene/archive',
      })).toBe(true)

      expect(canMoveFileTreeItemsToDirectory({
        sourcePaths: ['/project/scene/start.txt', '/project/scene/archive'],
        targetDirectoryPath: '/project/scene/archive',
      })).toBe(false)
    })
  })

  describe('文件复制目标', () => {
    it('目录复制会拒绝拖入自身和子目录，但允许复制到同父目录', () => {
      expect(canCopyFileTreeItemsToDirectory({
        sourceItems: [{ isDir: true, path: '/project/scene/chapter' }],
        targetDirectoryPath: '/project/scene/chapter',
      })).toBe(false)

      expect(canCopyFileTreeItemsToDirectory({
        sourceItems: [{ isDir: true, path: '/project/scene/chapter' }],
        targetDirectoryPath: '/project/scene/chapter/nested',
      })).toBe(false)

      expect(canCopyFileTreeItemsToDirectory({
        sourceItems: [{ isDir: true, path: '/project/scene/chapter' }],
        targetDirectoryPath: '/project/scene',
      })).toBe(true)
    })

    it('文件复制允许复制到同父目录', () => {
      expect(canCopyFileTreeItemsToDirectory({
        sourceItems: [{ isDir: false, path: '/project/scene/start.txt' }],
        targetDirectoryPath: '/project/scene',
      })).toBe(true)
    })
  })

  describe('拖拽集合规范化', () => {
    it('会剔除已被祖先目录覆盖的后代项并保持其余顺序', () => {
      expect(normalizeFileTreeTransferItems([
        { isDir: false, path: '/project/scene/chapter/branch.txt' },
        { isDir: true, path: '/project/scene/chapter' },
        { isDir: false, path: '/project/scene/ending.txt' },
        { isDir: false, path: '/project/scene/ending.txt' },
      ])).toEqual([
        { isDir: true, path: '/project/scene/chapter' },
        { isDir: false, path: '/project/scene/ending.txt' },
      ])
    })

    it('会从 payload items 或单项 payload 中解析投放集合', () => {
      expect(getFileTreeTransferPayloadItems({
        isDir: false,
        items: [
          { isDir: false, name: 'branch.txt', path: '/project/scene/chapter/branch.txt' },
          { isDir: true, name: 'chapter', path: '/project/scene/chapter' },
        ],
        name: 'branch.txt',
        path: '/project/scene/chapter/branch.txt',
        source: 'file-tree',
        type: 'file-system-item',
      })).toEqual([
        { isDir: true, name: 'chapter', path: '/project/scene/chapter' },
      ])

      expect(getFileTreeTransferPayloadItems({
        isDir: false,
        name: 'start.txt',
        path: '/project/scene/start.txt',
        source: 'file-viewer',
        type: 'file-system-item',
      })).toEqual([
        { isDir: false, name: 'start.txt', path: '/project/scene/start.txt' },
      ])
    })

    it('会按 move 和 copy 语义判断是否能投放到目录', () => {
      const directoryItem = { isDir: true, path: '/project/scene/chapter' }

      expect(canDropFileTreeTransferItemsToDirectory(
        [directoryItem],
        '/project/scene',
        'move',
      )).toBe(false)
      expect(canDropFileTreeTransferItemsToDirectory(
        [directoryItem],
        '/project/scene',
        'copy',
      )).toBe(true)
    })

    it('会复用 payload 规则解析可投放集合', () => {
      const payload = {
        isDir: true,
        name: 'chapter',
        path: '/project/scene/chapter',
        source: 'file-viewer' as const,
        type: 'file-system-item' as const,
      }

      expect(canDropFileTreeTransferPayloadToDirectory(
        payload,
        '/project/scene/chapter/nested',
        'copy',
      )).toBe(false)
      expect(resolveDroppableFileTreeTransferItems(
        payload,
        '/project/scene/chapter/nested',
        'copy',
      )).toBeUndefined()
      expect(resolveDroppableFileTreeTransferItems(
        payload,
        '/project/scene',
        'copy',
      )).toEqual([
        { isDir: true, name: 'chapter', path: '/project/scene/chapter' },
      ])
    })
  })
})
