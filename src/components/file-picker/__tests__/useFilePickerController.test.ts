import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

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
}

function flushControllerTasks() {
  return Promise.resolve().then(() => nextTick())
}

function createFixture(options: ControllerFixtureOptions = {}) {
  const modelValue = ref(options.modelValue ?? '')
  const rootPath = ref('/assets')
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
})
