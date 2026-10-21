import '~/__tests__/mocks/i18n'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { serializeAnimationFrames } from '~/domain/document/animation-document-codec'
import { createTextMetadata } from '~/domain/document/document-model'
import { AbsPath } from '~/domain/path'
import { createTestRenderer } from '~/features/editor/__tests__/utils/createTestRenderer'

import { useReferencedAnimationEditor } from '../useReferencedAnimationEditor'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { AnimationFrame } from '~/domain/stage/types'
import type { TestNode } from '~/features/editor/__tests__/utils/createTestRenderer'

const DEFAULT_CONTENT = '[{"duration":0},{"duration":200}]'
const METADATA = createTextMetadata(DEFAULT_CONTENT)
const PATH = '/games/demo/game/animation/walk/fade.json'

function createSentence(overrides: Partial<ISentence> = {}): ISentence {
  const command = overrides.command ?? commandType.say
  return {
    command,
    commandRaw: overrides.commandRaw ?? commandType[command],
    content: '',
    args: [],
    sentenceAssets: [],
    subScene: [],
    inlineComment: '',
    startLine: 0,
    endLine: 0,
    isLineBreakHolder: false,
    ...overrides,
  }
}

const {
  existsMock,
  fileEventHandlers,
  findTabIndexMock,
  getStateMock,
  handleErrorMock,
  modalOpenMock,
  openTabMock,
  readTextDocumentFileMock,
  replaceTextDocumentContentMock,
  resolveAnimationFileTargetMock,
  resolveFilePathMock,
  saveAnimationFileMock,
  saveFileMock,
  toastInfoMock,
  toastWarningMock,
} = vi.hoisted(() => ({
  existsMock: vi.fn(),
  fileEventHandlers: new Map<string, (event: Record<string, unknown>) => void>(),
  findTabIndexMock: vi.fn(),
  getStateMock: vi.fn(),
  handleErrorMock: vi.fn(),
  modalOpenMock: vi.fn(),
  openTabMock: vi.fn(),
  readTextDocumentFileMock: vi.fn(),
  replaceTextDocumentContentMock: vi.fn(),
  resolveAnimationFileTargetMock: vi.fn(),
  resolveFilePathMock: vi.fn(async (path: string) => path),
  saveAnimationFileMock: vi.fn(),
  saveFileMock: vi.fn(),
  toastInfoMock: vi.fn(),
  toastWarningMock: vi.fn(),
}))

const workspaceState = reactive({ CWD: '/games/demo' as string | undefined })
const tabsStoreMock = {
  findTabIndex: findTabIndexMock,
  openTab: openTabMock,
}
const modalStoreMock = {
  open: modalOpenMock,
}

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: () => workspaceState,
}))

vi.mock('~/stores/editor', () => ({
  isEditableEditor: (state: unknown) => Boolean(state && typeof state === 'object' && 'isDirty' in state),
  useEditorStore: () => ({
    getState: getStateMock,
    readTextDocumentFile: readTextDocumentFileMock,
    replaceTextDocumentContent: replaceTextDocumentContentMock,
    saveFile: saveFileMock,
  }),
}))

vi.mock('~/stores/file', () => ({
  useFileStore: () => ({
    resolveFilePath: resolveFilePathMock,
  }),
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: () => modalStoreMock,
}))

vi.mock('~/stores/tabs', () => ({
  useTabsStore: () => tabsStoreMock,
}))

vi.mock('~/composables/useFileSystemEvents', () => ({
  useFileSystemEvents: () => ({
    on: (type: string, handler: (event: Record<string, unknown>) => void) => {
      fileEventHandlers.set(type, handler)
      return () => {
        fileEventHandlers.delete(type)
      }
    },
  }),
}))

vi.mock('~/services/resource-index/service', () => ({
  useResourceIndex: () => ({
    getReferencesTo: () => [],
  }),
}))

vi.mock('~/features/editor/animation/animation-file', () => ({
  resolveAnimationFileTarget: resolveAnimationFileTargetMock,
  saveAnimationFile: saveAnimationFileMock,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: existsMock,
}))

vi.mock('~/utils/error-handler', () => ({
  handleError: handleErrorMock,
}))

vi.mock('vue-sonner', () => ({
  toast: {
    info: toastInfoMock,
    warning: toastWarningMock,
  },
}))

const mountedApps: { unmount: () => void }[] = []
const renderer = createTestRenderer()

function mountHarness() {
  let controller: ReturnType<typeof useReferencedAnimationEditor> | undefined

  const app = renderer.createApp({
    setup() {
      controller = useReferencedAnimationEditor()
      return () => undefined
    },
  })
  app.mount({ type: 'root', children: [] } satisfies TestNode)
  mountedApps.push(app)

  if (!controller) {
    throw new TypeError('expected referenced animation editor harness')
  }

  return controller
}

function openAnimation(controller: ReturnType<typeof useReferencedAnimationEditor>, content = 'walk/fade') {
  controller.open(createSentence({
    command: commandType.setAnimation,
    content,
  }), {
    scenePath: AbsPath.from('/games/demo/game/scene/start.txt'),
    statementId: 12,
  })
}

async function waitForStatus(
  controller: ReturnType<typeof useReferencedAnimationEditor>,
  status: string,
): Promise<void> {
  await vi.waitFor(() => {
    expect(controller.status).toBe(status)
  })
}

function createDirtyDraft(controller: ReturnType<typeof useReferencedAnimationEditor>): AnimationFrame[] {
  const frames: AnimationFrame[] = [{ duration: 0 }, { duration: 320, position: { x: 40 } }]
  controller.updateDraftFrames(frames)
  return frames
}

function setEditableState(isDirty: boolean): void {
  getStateMock.mockReturnValue({
    isDirty,
    kind: 'animation',
    path: PATH,
    projection: 'visual',
  })
}

beforeEach(() => {
  workspaceState.CWD = '/games/demo'
  fileEventHandlers.clear()
  existsMock.mockReset()
  existsMock.mockResolvedValue(true)
  findTabIndexMock.mockReset()
  findTabIndexMock.mockReturnValue(-1)
  getStateMock.mockReset()
  readTextDocumentFileMock.mockReset()
  readTextDocumentFileMock.mockResolvedValue({ content: DEFAULT_CONTENT, metadata: METADATA, ok: true })
  replaceTextDocumentContentMock.mockReset()
  resolveAnimationFileTargetMock.mockReset()
  resolveFilePathMock.mockClear()
  saveAnimationFileMock.mockReset()
  saveAnimationFileMock.mockResolvedValue(undefined)
  saveFileMock.mockReset()
  saveFileMock.mockResolvedValue(undefined)
  modalOpenMock.mockReset()
  openTabMock.mockReset()
  toastInfoMock.mockReset()
  toastWarningMock.mockReset()
  handleErrorMock.mockReset()
})

afterEach(() => {
  while (mountedApps.length > 0) {
    mountedApps.pop()?.unmount()
  }
})

describe('useReferencedAnimationEditor', () => {
  it('把动画文件读成草稿，不打开文档会话或标签页', async () => {
    const controller = mountHarness()

    openAnimation(controller)
    await waitForStatus(controller, 'ready')

    expect(controller.animationName).toBe('walk/fade')
    expect(controller.draftFrames).toEqual([{ duration: 0 }, { duration: 200 }])
    expect(controller.isDirty).toBe(false)
    expect(readTextDocumentFileMock).toHaveBeenCalledWith(PATH)
    expect(openTabMock).not.toHaveBeenCalled()
  })

  it('动画名无法解析时给出明确状态且不读取文件', async () => {
    const controller = mountHarness()

    openAnimation(controller, '{{animationName}}')
    await waitForStatus(controller, 'unresolved')

    expect(controller.unresolvedReason).toBe('dynamic-name')
    expect(readTextDocumentFileMock).not.toHaveBeenCalled()
  })

  it('文件不存在时可通过创建动作写入起始帧并加载成草稿', async () => {
    const controller = mountHarness()

    existsMock.mockResolvedValueOnce(false)
    resolveAnimationFileTargetMock.mockReturnValue({
      ok: true,
      target: { animationName: 'walk/fade', filePath: PATH },
    })
    readTextDocumentFileMock.mockResolvedValueOnce({ content: '[{"duration":0}]', metadata: METADATA, ok: true })

    openAnimation(controller)
    await waitForStatus(controller, 'missing')
    expect(readTextDocumentFileMock).not.toHaveBeenCalled()

    await controller.createFile()

    expect(saveAnimationFileMock).toHaveBeenCalledWith(
      '/games/demo',
      { animationName: 'walk/fade', filePath: PATH },
      [{ duration: 0 }],
    )
    await waitForStatus(controller, 'ready')
    expect(controller.draftFrames).toEqual([{ duration: 0 }])
  })

  it('读取失败进入可重试的失败态并上报错误', async () => {
    readTextDocumentFileMock.mockRejectedValueOnce(new Error('read failed'))
    const controller = mountHarness()

    openAnimation(controller)
    await waitForStatus(controller, 'load-failed')

    expect(handleErrorMock).toHaveBeenCalledTimes(1)
    expect(controller.isOpen).toBe(true)
  })

  it('保存失败保留草稿并保持抽屉打开', async () => {
    const controller = mountHarness()
    openAnimation(controller)
    await waitForStatus(controller, 'ready')

    createDirtyDraft(controller)
    saveAnimationFileMock.mockRejectedValueOnce(new Error('write failed'))

    await expect(controller.save()).resolves.toBe(false)

    expect(handleErrorMock).toHaveBeenCalledTimes(1)
    expect(controller.isDirty).toBe(true)
    expect(controller.isOpen).toBe(true)
  })

  it('脏草稿关闭时弹出保存确认，选择不保存直接丢弃', async () => {
    const controller = mountHarness()
    openAnimation(controller)
    await waitForStatus(controller, 'ready')

    createDirtyDraft(controller)
    controller.requestClose()

    expect(modalOpenMock).toHaveBeenCalledWith('SaveChangesModal', expect.objectContaining({
      title: 'modals.saveChanges.title',
    }))
    const payload = modalOpenMock.mock.calls[0]?.[1] as { onDontSave: () => void }

    payload.onDontSave()

    expect(saveAnimationFileMock).not.toHaveBeenCalled()
    expect(saveFileMock).not.toHaveBeenCalled()
    expect(controller.isOpen).toBe(false)
  })

  it('保存确认把草稿写入文件后关闭', async () => {
    const controller = mountHarness()
    openAnimation(controller)
    await waitForStatus(controller, 'ready')

    const frames = createDirtyDraft(controller)
    controller.requestClose()
    const payload = modalOpenMock.mock.calls[0]?.[1] as { onSave: () => Promise<void> }
    await payload.onSave()

    expect(saveAnimationFileMock).toHaveBeenCalledWith(
      '/games/demo',
      { animationName: 'walk/fade', filePath: PATH },
      frames,
      METADATA,
    )
    expect(controller.isOpen).toBe(false)
  })

  it('文件在标签页打开且干净时把草稿替换进会话并保存', async () => {
    const controller = mountHarness()
    openAnimation(controller)
    await waitForStatus(controller, 'ready')

    findTabIndexMock.mockReturnValue(0)
    setEditableState(false)
    const frames = createDirtyDraft(controller)

    await expect(controller.save()).resolves.toBe(true)

    expect(replaceTextDocumentContentMock).toHaveBeenCalledWith(
      PATH,
      serializeAnimationFrames(frames),
    )
    expect(saveFileMock).toHaveBeenCalledWith(PATH)
    expect(saveAnimationFileMock).not.toHaveBeenCalled()
    expect(controller.isDirty).toBe(false)
  })

  it('标签页有未保存修改时拒绝保存并保留草稿', async () => {
    const controller = mountHarness()
    openAnimation(controller)
    await waitForStatus(controller, 'ready')

    findTabIndexMock.mockReturnValue(0)
    setEditableState(true)
    createDirtyDraft(controller)

    await expect(controller.save()).resolves.toBe(false)

    expect(toastWarningMock).toHaveBeenCalledWith('edit.visualEditor.animation.referenced.tabDirty')
    expect(replaceTextDocumentContentMock).not.toHaveBeenCalled()
    expect(saveAnimationFileMock).not.toHaveBeenCalled()
    expect(controller.isOpen).toBe(true)
  })

  it('标签页有未保存修改时拒绝打开抽屉', async () => {
    findTabIndexMock.mockReturnValue(0)
    setEditableState(true)
    const controller = mountHarness()

    openAnimation(controller)
    await vi.waitFor(() => {
      expect(toastWarningMock).toHaveBeenCalledWith('edit.visualEditor.animation.referenced.tabDirty')
    })

    expect(controller.isOpen).toBe(false)
    expect(readTextDocumentFileMock).not.toHaveBeenCalled()
  })

  it('绑定文件被删除时提示并关闭干净草稿', async () => {
    const controller = mountHarness()
    openAnimation(controller)
    await waitForStatus(controller, 'ready')

    fileEventHandlers.get('file:removed')?.({
      path: PATH,
    })

    expect(toastWarningMock).toHaveBeenCalledWith('edit.visualEditor.animation.referenced.removed')
    expect(controller.isOpen).toBe(false)
    expect(modalOpenMock).not.toHaveBeenCalled()
  })

  it('绑定文件重命名后跟随新路径并保留草稿', async () => {
    const controller = mountHarness()
    openAnimation(controller)
    await waitForStatus(controller, 'ready')

    fileEventHandlers.get('file:renamed')?.({
      oldPath: PATH,
      newPath: '/games/demo/game/animation/walk/renamed.json',
    })

    expect(controller.binding?.filePath).toBe('/games/demo/game/animation/walk/renamed.json')
    expect(controller.draftFrames).toEqual([{ duration: 0 }, { duration: 200 }])
    expect(readTextDocumentFileMock).toHaveBeenCalledTimes(1)
    expect(toastInfoMock).toHaveBeenCalledWith('edit.visualEditor.animation.referenced.renamed')
  })

  it('v2 动画只读，并提供在文本模式打开的出口', async () => {
    readTextDocumentFileMock.mockResolvedValue({
      content: '{"version":2,"keyframes":[]}',
      metadata: METADATA,
      ok: true,
    })
    const controller = mountHarness()

    openAnimation(controller)
    await waitForStatus(controller, 'v2-read-only')
    expect(controller.draftFrames).toBeUndefined()

    controller.openInTextMode()

    expect(controller.isOpen).toBe(false)
    expect(openTabMock).toHaveBeenCalledWith(
      'fade.json',
      PATH,
      { forceNormal: true },
    )
  })

  it('非法动画 JSON 进入只读态，不提供帧编辑', async () => {
    readTextDocumentFileMock.mockResolvedValue({
      content: '{',
      metadata: METADATA,
      ok: true,
    })
    const controller = mountHarness()

    openAnimation(controller)
    await waitForStatus(controller, 'invalid-json')

    expect(controller.draftFrames).toBeUndefined()
  })
})
