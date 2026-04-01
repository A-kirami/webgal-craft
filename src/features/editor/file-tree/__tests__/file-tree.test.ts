import { describe, expect, it } from 'vitest'

import {
  getFileTreeNameSelectionEnd,
  hasFileTreeDuplicateName,
  insertCreatingFileTreeItem,
  resolveFileTreeCreateBlurAction,
  resolveFileTreeCreateStart,
  resolveFileTreeRenameBlurAction,
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

describe('文件树辅助函数', () => {
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
})
