import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

import { AppError } from '~/types/errors'

import { useFilePickerController } from '../useFilePickerController'

const {
  existsMock,
  joinMock,
  normalizeMock,
  statMock,
} = vi.hoisted(() => ({
  existsMock: vi.fn(async () => true),
  joinMock: vi.fn(async (...parts: string[]) => parts.join('/').replaceAll('//', '/')),
  normalizeMock: vi.fn(async (value: string) => value.replaceAll('\\', '/')),
  statMock: vi.fn(async (path: string) => ({ isDirectory: path === '/assets' })),
}))

vi.mock('@tauri-apps/api/path', () => ({
  join: joinMock,
  normalize: normalizeMock,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: existsMock,
  stat: statMock,
}))

interface ControllerFixtureOptions {
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
  const readDirectory = vi.fn(async (_path: string, request: { requestId: number }) => ({
    absolutePath: '/assets',
    items: [],
    requestId: request.requestId,
  }))
  const updateRecentHistory = vi.fn()
  const syncRecentHistory = vi.fn()
  const refreshRecentHistoryInvalidState = vi.fn(async () => {
    await Promise.resolve()
  })
  const removeRecentHistoryPaths = vi.fn()
  const ensurePathWithinRoot = vi.fn(async (path: string) => path)

  const controller = scope.run(() => useFilePickerController({
    disabled: () => disabled.value,
    ensurePathWithinRoot,
    exclude: () => [],
    extensions: () => [],
    isRecentHistoryInvalid: () => false,
    modelValue: () => modelValue.value,
    readDirectory,
    refreshRecentHistoryInvalidState,
    removeRecentHistoryPaths,
    reopenInSelectedParent: () => reopenInSelectedParent.value,
    rootPath: () => rootPath.value,
    setModelValue: (value) => {
      modelValue.value = value
    },
    showSupportedOnly: () => true,
    syncRecentHistory,
    updateRecentHistory,
  }))

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
    joinMock.mockClear()
    normalizeMock.mockClear()
    statMock.mockClear()
    existsMock.mockImplementation(async () => true)
    joinMock.mockImplementation(async (...parts: string[]) => parts.join('/').replaceAll('//', '/'))
    normalizeMock.mockImplementation(async (value: string) => value.replaceAll('\\', '/'))
    statMock.mockImplementation(async (path: string) => ({ isDirectory: path === '/assets' }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
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
        absolutePath: '/assets/images/bg',
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
