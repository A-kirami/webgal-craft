import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

import { AbsPath } from '~/domain/path'
import { AppError } from '~/types/errors'

import { useFilePickerController } from '../useFilePickerController'

import type { FileViewerItem } from '~/types/file-viewer'

const {
  existsMock,
  statMock,
} = vi.hoisted(() => ({
  existsMock: vi.fn(async () => true),
  statMock: vi.fn(async (path: string) => ({ isDirectory: path === '/assets' })),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: existsMock,
  stat: statMock,
}))

interface ControllerFixtureOptions {
  commitInputOnBlur?: boolean
  extensions?: string[]
  modelValue?: string
  reopenInSelectedParent?: boolean
  rootPath?: string
}

function flushControllerTasks() {
  return Promise.resolve().then(() => nextTick())
}

function createFixture(options: ControllerFixtureOptions = {}) {
  const modelValue = ref(options.modelValue ?? '')
  const rootPath = ref(options.rootPath ?? '/assets')
  const disabled = ref(false)
  const reopenInSelectedParent = ref(options.reopenInSelectedParent ?? false)
  const scope = effectScope()
  const readDirectory = vi.fn(async (
    path: AbsPath,
    request: { requestId: number },
  ): Promise<{ absolutePath: AbsPath, items: FileViewerItem[], requestId: number }> => ({
    absolutePath: path,
    items: [],
    requestId: request.requestId,
  }))
  const updateRecentHistory = vi.fn()
  const syncRecentHistory = vi.fn()
  const refreshRecentHistoryInvalidState = vi.fn(async () => {
    await Promise.resolve()
  })
  const removeRecentHistoryPaths = vi.fn()
  const ensurePathWithinRoot = vi.fn(async (path: AbsPath) => path)

  const controllerOptions = {
    disabled: () => disabled.value,
    commitInputOnBlur: () => options.commitInputOnBlur ?? true,
    ensurePathWithinRoot,
    exclude: () => [],
    extensions: () => options.extensions ?? [],
    isRecentHistoryInvalid: () => false,
    modelValue: () => modelValue.value,
    readDirectory,
    refreshRecentHistoryInvalidState,
    removeRecentHistoryPaths,
    reopenInSelectedParent: () => reopenInSelectedParent.value,
    rootPath: () => rootPath.value,
    setModelValue: (value: string) => {
      modelValue.value = value
    },
    showSupportedOnly: () => true,
    syncRecentHistory,
    updateRecentHistory,
  }

  const controller = scope.run(() => useFilePickerController(controllerOptions))

  if (!controller) {
    throw new TypeError('预期返回 FilePicker controller')
  }

  return {
    controller,
    modelValue,
    readDirectory,
    scope,
  }
}

describe('useFilePickerController', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    existsMock.mockClear()
    statMock.mockClear()
    existsMock.mockImplementation(async () => true)
    statMock.mockImplementation(async (path: string) => ({ isDirectory: path === '/assets' }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('根目录为空时仍会打开并显示空列表', async () => {
    const { controller, readDirectory, scope } = createFixture()

    await flushControllerTasks()
    await controller.openPopover()

    expect(controller.isOpen.value).toBe(true)
    expect(controller.filteredItems.value).toEqual([])
    expect(controller.errorMsg.value).toBe('')
    expect(readDirectory).toHaveBeenCalledOnce()

    scope.stop()
  })

  it('根目录不存在时仍会打开为空列表且不读取目录', async () => {
    existsMock.mockResolvedValue(false)
    const { controller, readDirectory, scope } = createFixture()

    await flushControllerTasks()
    await controller.openPopover()

    expect(controller.isOpen.value).toBe(true)
    expect(controller.filteredItems.value).toEqual([])
    expect(controller.errorMsg.value).toBe('')
    expect(readDirectory).not.toHaveBeenCalled()

    scope.stop()
  })

  it('根目录不存在时仍允许输入子路径并保持空状态', async () => {
    existsMock.mockResolvedValue(false)
    const { controller, readDirectory, scope } = createFixture()

    await flushControllerTasks()
    await controller.openPopover()
    await nextTick()

    controller.inputText.value = 'images/'
    await vi.advanceTimersByTimeAsync(300)
    await flushControllerTasks()

    expect(controller.currentDir.value).toBe('images')
    expect(controller.filteredItems.value).toEqual([])
    expect(controller.errorMsg.value).toBe('')
    expect(readDirectory).not.toHaveBeenCalled()

    scope.stop()
  })

  it('缺失的根目录随后创建后会在重新打开时读取内容', async () => {
    let rootExists = false
    existsMock.mockImplementation(async () => rootExists)
    const { controller, readDirectory, scope } = createFixture()

    await flushControllerTasks()
    await controller.openPopover()
    controller.handlePopoverOpenChange(false)

    rootExists = true
    await controller.openPopover()

    expect(controller.isOpen.value).toBe(true)
    expect(readDirectory).toHaveBeenCalledOnce()

    scope.stop()
  })

  it('根目录只有不支持的文件时仍会打开为空列表', async () => {
    const { controller, readDirectory, scope } = createFixture({
      extensions: ['.png'],
    })
    readDirectory.mockImplementation(async (path: AbsPath, request: { requestId: number }) => ({
      absolutePath: path,
      items: [{
        isDir: false,
        name: 'notes.txt',
        path: '/assets/notes.txt',
      }],
      requestId: request.requestId,
    }))

    await flushControllerTasks()
    await controller.openPopover()

    expect(controller.isOpen.value).toBe(true)
    expect(controller.filteredItems.value).toEqual([])
    expect(controller.errorMsg.value).toBe('')

    scope.stop()
  })

  it('根路径不是目录时不会打开或尝试读取', async () => {
    statMock.mockResolvedValue({ isDirectory: false })
    const { controller, readDirectory, scope } = createFixture()

    await flushControllerTasks()
    await controller.openPopover()

    expect(controller.isOpen.value).toBe(false)
    expect(readDirectory).not.toHaveBeenCalled()

    scope.stop()
  })

  it('reopenInSelectedParent 打开时会回到当前选中文件的父目录', async () => {
    const { controller, readDirectory, scope } = createFixture({
      modelValue: 'images/bg/opening.png',
      reopenInSelectedParent: true,
    })

    await flushControllerTasks()
    await controller.openPopover()

    expect(readDirectory).toHaveBeenLastCalledWith('/assets/images/bg', {
      rootPath: '/assets',
      requestId: 1,
    })
    expect(controller.currentDir.value).toBe('images/bg')
    expect(controller.inputText.value).toBe('images/bg/opening.png')

    scope.stop()
  })

  it('Escape 后紧接 blur 不会把草稿路径提交回父层', async () => {
    const { controller, modelValue, scope } = createFixture({
      modelValue: 'images/bg/original.png',
    })

    await flushControllerTasks()

    controller.inputText.value = 'images/bg/draft/'
    controller.handleEscape()
    controller.handleInputBlur()
    await vi.runAllTimersAsync()

    expect(modelValue.value).toBe('images/bg/original.png')
    expect(controller.inputText.value).toBe('images/bg/original.png')

    scope.stop()
  })

  it('目录读取返回 DIR_NOT_FOUND 时会保留当前目录并显示错误信息', async () => {
    const { controller, readDirectory, scope } = createFixture({
      modelValue: 'images/bg/opening.png',
      reopenInSelectedParent: true,
    })

    readDirectory
      .mockResolvedValueOnce({
        absolutePath: AbsPath.from('/assets/images/bg'),
        items: [],
        requestId: 1,
      })
      .mockRejectedValueOnce(new AppError('DIR_NOT_FOUND', '目录不存在'))

    await flushControllerTasks()
    await controller.openPopover()

    expect(controller.currentDir.value).toBe('images/bg')

    await controller.handleNavigateItem({
      isDir: true,
      name: 'missing',
      path: '/assets/missing',
    })

    expect(controller.currentDir.value).toBe('images/bg')
    expect(controller.errorMsg.value).toBe('目录不存在')
    expect(controller.isLoading.value).toBe(false)

    scope.stop()
  })

  it('目录读取失败时仍会打开并显示现有错误状态', async () => {
    const { controller, readDirectory, scope } = createFixture()
    readDirectory.mockRejectedValue(new AppError('IO_ERROR', '没有目录读取权限'))

    await flushControllerTasks()
    await controller.openPopover()

    expect(controller.isOpen.value).toBe(true)
    expect(controller.errorMsg.value).toBe('没有目录读取权限')
    expect(controller.isLoading.value).toBe(false)

    scope.stop()
  })

  it('trigger 模式关闭 popover 时不会把目录导航草稿覆盖为最终值', async () => {
    const { controller, modelValue, scope } = createFixture({
      commitInputOnBlur: false,
      modelValue: 'images/bg/original.png',
    })

    await flushControllerTasks()
    await controller.openPopover()

    await controller.handleNavigateItem({
      isDir: true,
      name: 'draft',
      path: '/assets/images/bg/draft',
    })
    controller.handlePopoverOpenChange(false)
    await vi.runAllTimersAsync()

    expect(modelValue.value).toBe('images/bg/original.png')
    expect(controller.inputText.value).toBe('images/bg/original.png')

    scope.stop()
  })

  it('路径输入前缀过滤会先于搜索框包含过滤叠加生效', async () => {
    const { controller, readDirectory, scope } = createFixture()

    readDirectory.mockImplementation(async (path: AbsPath, request: { requestId: number }) => ({
      absolutePath: path,
      items: [
        {
          isDir: false,
          name: 'opening.png',
          path: '/assets/opening.png',
        },
        {
          isDir: false,
          name: 'option.png',
          path: '/assets/option.png',
        },
        {
          isDir: false,
          name: 'top-opening.png',
          path: '/assets/top-opening.png',
        },
        {
          isDir: false,
          name: 'ending.png',
          path: '/assets/ending.png',
        },
      ],
      requestId: request.requestId,
    }))

    await flushControllerTasks()
    await controller.openPopover()

    controller.inputText.value = 'op'
    await vi.advanceTimersByTimeAsync(300)
    await flushControllerTasks()

    expect(controller.filterKeyword.value).toBe('op')
    expect(controller.filteredItems.value.map(item => item.name)).toEqual(['opening.png', 'option.png'])

    controller.handleSearchQueryChange('ning')

    expect(controller.searchQuery.value).toBe('ning')
    expect(controller.inputText.value).toBe('op')
    expect(controller.filteredItems.value.map(item => item.name)).toEqual(['opening.png', 'option.png'])

    await vi.advanceTimersByTimeAsync(299)
    await flushControllerTasks()

    expect(controller.searchQuery.value).toBe('ning')
    expect(controller.filteredItems.value.map(item => item.name)).toEqual(['opening.png', 'option.png'])

    await vi.advanceTimersByTimeAsync(1)
    await flushControllerTasks()

    expect(controller.searchQuery.value).toBe('ning')
    expect(controller.filteredItems.value.map(item => item.name)).toEqual(['opening.png'])

    controller.handleSearchQueryChange('')

    expect(controller.searchQuery.value).toBe('')
    expect(controller.filteredItems.value.map(item => item.name)).toEqual(['opening.png', 'option.png'])

    await vi.advanceTimersByTimeAsync(300)
    await flushControllerTasks()

    expect(controller.filteredItems.value.map(item => item.name)).toEqual(['opening.png', 'option.png'])

    scope.stop()
  })

  it('手动清空输入会立即回到根目录并取消挂起的防抖同步', async () => {
    const { controller, readDirectory, scope } = createFixture({
      modelValue: 'images/bg/opening.png',
      reopenInSelectedParent: true,
    })

    await flushControllerTasks()
    await controller.openPopover()

    expect(readDirectory).toHaveBeenCalledTimes(1)
    expect(readDirectory).toHaveBeenLastCalledWith('/assets/images/bg', {
      rootPath: '/assets',
      requestId: 1,
    })
    expect(controller.currentDir.value).toBe('images/bg')

    controller.inputText.value = 'images/bg/op'
    controller.inputText.value = ''
    await flushControllerTasks()

    expect(controller.currentDir.value).toBe('')
    expect(controller.filterKeyword.value).toBe('')
    expect(readDirectory).toHaveBeenCalledTimes(2)
    expect(readDirectory.mock.lastCall).toEqual([
      expect.stringMatching(/^\/assets\/?$/),
      {
        rootPath: '/assets',
        requestId: 2,
      },
    ])

    await vi.advanceTimersByTimeAsync(300)
    await flushControllerTasks()

    expect(controller.currentDir.value).toBe('')
    expect(controller.filterKeyword.value).toBe('')
    expect(readDirectory).toHaveBeenCalledTimes(2)

    scope.stop()
  })

  it('删除到当前目录时会立即清除过滤且不重新读取目录', async () => {
    const { controller, readDirectory, scope } = createFixture({
      modelValue: 'images/bg/opening.png',
      reopenInSelectedParent: true,
    })

    await flushControllerTasks()
    await controller.openPopover()

    controller.inputText.value = 'images/bg/op'
    await vi.advanceTimersByTimeAsync(300)
    await flushControllerTasks()

    expect(controller.currentDir.value).toBe('images/bg')
    expect(controller.filterKeyword.value).toBe('op')
    expect(readDirectory).toHaveBeenCalledTimes(2)

    controller.inputText.value = 'images/bg/'
    await flushControllerTasks()

    expect(controller.currentDir.value).toBe('images/bg')
    expect(controller.filterKeyword.value).toBe('')
    expect(readDirectory).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(300)
    await flushControllerTasks()

    expect(controller.currentDir.value).toBe('images/bg')
    expect(controller.filterKeyword.value).toBe('')
    expect(readDirectory).toHaveBeenCalledTimes(2)

    scope.stop()
  })

  // 这里验证 controller 会保持路径比较的大小写敏感性：
  // rootPath 会从 '/Assets' 规范化而来，但 handleSelectItem 收到的是 '/assets/file-1.txt'。
  // 下面的断言用于确认它会被视为非根目录内的相对路径，并在 modelValue.value
  // 和 controller.inputText.value 中都保留为 'assets/file-1.txt'。
  it('大小写不一致的绝对路径不会被当作根目录内相对路径', async () => {
    statMock.mockImplementation(async (path: string) => ({
      isDirectory: path === '/assets' || path === '/Assets',
    }))

    const { controller, modelValue, scope } = createFixture({
      rootPath: '/Assets',
    })

    await flushControllerTasks()
    expect(controller.canonicalRootPath.value).toBe('/Assets')

    controller.handleSelectItem({
      isDir: false,
      name: 'file-1.txt',
      path: '/assets/file-1.txt',
    })

    expect(modelValue.value).toBe('assets/file-1.txt')
    expect(controller.inputText.value).toBe('assets/file-1.txt')

    scope.stop()
  })
})
