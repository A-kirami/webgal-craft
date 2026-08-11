import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'
import { AbsPath } from '~/domain/path'

import { useExternalFileDropImport } from '../useExternalFileDropImport'

import type { UseTauriDropZoneOptions } from '~/composables/useTauriDropZone'

const {
  dropZoneMockState,
  importExternalFilesMock,
  toastErrorMock,
  toastWarningMock,
} = vi.hoisted(() => ({
  dropZoneMockState: {
    options: undefined as UseTauriDropZoneOptions | undefined,
    targetElement: undefined as { value: Element | undefined } | undefined,
  },
  importExternalFilesMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastWarningMock: vi.fn(),
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: toastErrorMock,
    warning: toastWarningMock,
  },
}))

vi.mock('~/composables/useTauriDropZone', async () => {
  const { shallowRef } = await import('vue')
  return {
    useTauriDropZone: (_target: unknown, options: UseTauriDropZoneOptions) => {
      dropZoneMockState.options = options
      const targetElement = shallowRef<Element>()
      dropZoneMockState.targetElement = targetElement
      return {
        files: shallowRef<string[]>(),
        isOverDropZone: shallowRef(false),
        targetElement,
      }
    },
  }
})

vi.mock('../external-file-import', async (importOriginal) => {
  const original = await importOriginal<typeof import('../external-file-import')>()
  return {
    ...original,
    importExternalFiles: importExternalFilesMock,
  }
})

const rootDirectory = AbsPath.from('/project/game/scene')
const messages = {
  'zh-Hans': {
    edit: {
      externalFileImport: {
        busy: '另一批文件仍在导入中',
        failed: '{count} 个项目导入失败',
        failedItems: '失败项目：{names}',
        partial: '已导入 {successCount} 个项目，{failedCount} 个失败',
        renamedConflicts: '已自动重命名 {count} 个同名项目',
      },
    },
  },
}

function renderComposable() {
  let result: ReturnType<typeof useExternalFileDropImport> | undefined
  const Harness = defineComponent({
    setup() {
      result = useExternalFileDropImport({
        dropZone: undefined,
        rootDirectory,
      })
      return () => h('div')
    },
  })

  const rendered = renderInBrowser(Harness, {
    browser: {
      i18nMode: 'localized',
      messages,
    },
  })

  const rootSurface = document.createElement('div')
  rootSurface.dataset.fileViewerRootSurface = 'true'
  if (dropZoneMockState.targetElement) {
    dropZoneMockState.targetElement.value = rootSurface
  }

  return {
    rendered,
    result: result as ReturnType<typeof useExternalFileDropImport>,
  }
}

function drop(paths: string[]): void {
  const onDrop = dropZoneMockState.options?.onDrop
  expect(onDrop).toBeTypeOf('function')
  onDrop?.(paths)
}

beforeEach(() => {
  dropZoneMockState.options = undefined
  dropZoneMockState.targetElement = undefined
  importExternalFilesMock.mockReset()
  toastErrorMock.mockReset()
  toastWarningMock.mockReset()
})

describe('useExternalFileDropImport', () => {
  it('命中子目录时会把该目录传给导入流程', async () => {
    importExternalFilesMock.mockResolvedValue({ failures: [], successes: [] })
    const { rendered, result } = renderComposable()
    const directory = document.createElement('div')
    const child = document.createElement('span')
    directory.dataset.fileTreeDropTargetPath = '/project/game/scene/chapter-1'
    directory.dataset.fileTreeIsDir = 'true'
    directory.dataset.fileTreePath = '/project/game/scene/chapter-1'
    directory.append(child)
    if (dropZoneMockState.targetElement) {
      dropZoneMockState.targetElement.value = child
    }

    dropZoneMockState.options?.onEnter?.(['/downloads/start.txt'])

    expect(result.targetDirectory.value).toBe('/project/game/scene/chapter-1')

    drop(['/downloads/start.txt'])
    await vi.waitFor(() => expect(importExternalFilesMock).toHaveBeenCalledWith(
      ['/downloads/start.txt'],
      '/project/game/scene/chapter-1',
    ))
    rendered.unmount()
  })

  it('拖拽经过不同目录并离开时会同步清理目标高亮', () => {
    const { rendered, result } = renderComposable()
    const firstDirectory = document.createElement('div')
    firstDirectory.dataset.fileTreeDropTargetPath = '/project/game/scene/chapter-1'
    firstDirectory.dataset.fileTreePath = '/project/game/scene/chapter-1'
    firstDirectory.dataset.fileTreeIsDir = 'true'
    const secondDirectory = document.createElement('div')
    secondDirectory.dataset.fileTreeDropTargetPath = '/project/game/scene/chapter-2'
    secondDirectory.dataset.fileTreePath = '/project/game/scene/chapter-2'
    secondDirectory.dataset.fileTreeIsDir = 'true'

    if (dropZoneMockState.targetElement) {
      dropZoneMockState.targetElement.value = firstDirectory
    }
    dropZoneMockState.options?.onEnter?.([])
    expect(result.targetDirectory.value).toBe('/project/game/scene/chapter-1')

    if (dropZoneMockState.targetElement) {
      dropZoneMockState.targetElement.value = secondDirectory
    }
    dropZoneMockState.options?.onOver?.()
    expect(result.targetDirectory.value).toBe('/project/game/scene/chapter-2')

    dropZoneMockState.options?.onLeave?.()
    expect(result.targetDirectory.value).toBeUndefined()
    rendered.unmount()
  })

  it('全部成功且未改名时保持静默', async () => {
    importExternalFilesMock.mockResolvedValue({
      failures: [],
      successes: [{
        sourcePath: AbsPath.from('/downloads/hero.png'),
        targetPath: AbsPath.from('/project/game/scene/hero.png'),
      }],
    })
    const { rendered } = renderComposable()

    drop(['/downloads/hero.png'])
    await vi.waitFor(() => expect(importExternalFilesMock).toHaveBeenCalledOnce())

    expect(toastWarningMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
    rendered.unmount()
  })

  it('全部成功且发生冲突改名时也保持静默', async () => {
    importExternalFilesMock.mockResolvedValue({
      failures: [],
      successes: [{
        sourcePath: AbsPath.from('/downloads/hero.png'),
        targetPath: AbsPath.from('/project/game/scene/hero (1).png'),
      }],
    })
    const { rendered } = renderComposable()

    drop(['/downloads/hero.png'])
    await vi.waitFor(() => expect(importExternalFilesMock).toHaveBeenCalledOnce())

    expect(toastWarningMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
    rendered.unmount()
  })

  it('部分失败时同时反馈成功数、失败项和冲突改名', async () => {
    importExternalFilesMock.mockResolvedValue({
      failures: [{ sourcePath: '/downloads/broken.png', error: new Error('broken') }],
      successes: [{
        sourcePath: AbsPath.from('/downloads/hero.png'),
        targetPath: AbsPath.from('/project/game/scene/hero (1).png'),
      }],
    })
    const { rendered } = renderComposable()

    drop(['/downloads/broken.png', '/downloads/hero.png'])

    await vi.waitFor(() => expect(toastWarningMock).toHaveBeenCalledWith(
      '已导入 1 个项目，1 个失败',
      { description: '失败项目：broken.png\n已自动重命名 1 个同名项目' },
    ))
    expect(toastErrorMock).not.toHaveBeenCalled()
    rendered.unmount()
  })

  it('全部失败时列出失败项目且不发送成功通知', async () => {
    importExternalFilesMock.mockResolvedValue({
      failures: [
        { sourcePath: '/downloads/a.png', error: new Error('a') },
        { sourcePath: '/downloads/b.png', error: new Error('b') },
        { sourcePath: '/downloads/c.png', error: new Error('c') },
        { sourcePath: '/downloads/d.png', error: new Error('d') },
      ],
      successes: [],
    })
    const { rendered } = renderComposable()

    drop(['/downloads/a.png', '/downloads/b.png', '/downloads/c.png', '/downloads/d.png'])

    await vi.waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith(
      '4 个项目导入失败',
      { description: '失败项目：a.png, b.png, c.png (+1)' },
    ))
    rendered.unmount()
  })

  it('导入期间拒绝启动第二批并在首批结束后恢复空闲', async () => {
    let finishImport: ((value: { failures: never[], successes: never[] }) => void) | undefined
    importExternalFilesMock
      .mockImplementationOnce(() => new Promise((resolve) => {
        finishImport = resolve
      }))
      .mockResolvedValue({ failures: [], successes: [] })
    const { rendered } = renderComposable()

    drop(['/downloads/first.png'])
    await vi.waitFor(() => expect(importExternalFilesMock).toHaveBeenCalledOnce())
    drop(['/downloads/second.png'])

    expect(importExternalFilesMock).toHaveBeenCalledOnce()
    expect(toastWarningMock).toHaveBeenCalledWith('另一批文件仍在导入中')

    finishImport?.({ failures: [], successes: [] })
    await Promise.resolve()
    await Promise.resolve()

    drop(['/downloads/third.png'])
    await vi.waitFor(() => expect(importExternalFilesMock).toHaveBeenCalledTimes(2))
    rendered.unmount()
  })
})
