import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '~/types/errors'

import { createLoadedDocumentState } from '../editor-document-state'
import { handleFileModifiedEvent, handleFileRenamedEvent } from '../editor-file-lifecycle'
import { createEditableSession, syncProjectionStateFromDocument } from '../editor-session'

import type { EditorFileLifecycleContext } from '../editor-file-lifecycle'
import type { EditableEditorSession, EditorSession } from '../editor-session'

const DOC_PATH = '/game/animation/sample.json'
const CLEAN_CONTENT = '[{"duration":100}]'
const DIRTY_CONTENT = '[{"duration":240}]'

const { modalOpenMock } = vi.hoisted(() => ({
  modalOpenMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  error: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  stat: vi.fn(),
}))

vi.mock('~/commands/fs', () => ({
  fsCmds: {
    isBinaryFile: vi.fn(),
  },
}))

vi.mock('~/helper/app-paths', () => ({
  gameAssetDir: vi.fn(),
}))

vi.mock('~/plugins/mime', () => ({
  mime: {
    getType: vi.fn(),
  },
}))

vi.mock('~/services/document-write-intents', () => ({
  consumePendingDocumentWrite: vi.fn(() => false),
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: () => ({
    open: modalOpenMock,
  }),
}))

interface ContextHarnessOptions extends Partial<EditorFileLifecycleContext> {
  autoSavePending?: boolean
  externalContent?: string
  path?: string
}

function createTextMetadata() {
  return {
    // eslint-disable-next-line unicorn/text-encoding-identifier-case -- 持久化元数据沿用应用内部编码标识
    encoding: 'utf-8' as const,
    lineEnding: '\n' as const,
  }
}

function createContextHarness(options: ContextHarnessOptions = {}) {
  const {
    autoSavePending,
    externalContent,
    path: providedPath,
    readTextDocumentFile: providedReadTextDocumentFile,
    syncStateFromDocument: providedSyncStateFromDocument,
    ...contextOverrides
  } = options
  const path = providedPath ?? DOC_PATH
  const session = createEditableSession(
    path,
    createLoadedDocumentState('animation', CLEAN_CONTENT),
    'text',
  )
  const sessions = new Map<string, EditorSession>([[path, session]])
  const cancelAutoSave = vi.fn()
  const scheduleAutoSave = vi.fn()
  const defaultSyncStateFromDocument = vi.fn((currentPath: string) => {
    const currentSession = sessions.get(currentPath)
    if (currentSession?.type !== 'editable') {
      return
    }

    syncProjectionStateFromDocument(
      currentSession.document,
      currentSession.textState,
      currentSession.visualState,
    )
  })
  const syncStateFromDocument = providedSyncStateFromDocument ?? defaultSyncStateFromDocument

  session.textState.textContent = DIRTY_CONTENT
  session.textState.textSource = 'draft'
  session.textState.isDirty = true
  session.document.model = createLoadedDocumentState('animation', DIRTY_CONTENT).model
  session.document.cachedTextContent = DIRTY_CONTENT

  const defaultReadTextDocumentFile = vi.fn(async () => ({
    ok: true as const,
    content: externalContent ?? DIRTY_CONTENT,
    metadata: createTextMetadata(),
  }))

  const baseContext = {
    autoSaveHasPending: (currentPath: string) => autoSavePending === true && currentPath === path,
    cancelAutoSave,
    canReschedulePendingAutoSave: () => true,
    createEditorError: (message: string) => new AppError('EDITOR_ERROR', message),
    deleteSession(path: string) {
      sessions.delete(path)
    },
    getActiveTabPath: () => undefined,
    getAssetUrl: () => '',
    getDocumentState(path: string) {
      const currentSession = sessions.get(path)
      return currentSession?.type === 'editable' ? currentSession.document : undefined
    },
    getEditableSession(path: string): EditableEditorSession | undefined {
      const currentSession = sessions.get(path)
      return currentSession?.type === 'editable' ? currentSession : undefined
    },
    getEditableState(path: string) {
      const currentSession = sessions.get(path)
      if (currentSession?.type !== 'editable') {
        return
      }
      return currentSession.activeProjection === 'text'
        ? currentSession.textState
        : currentSession.visualState
    },
    getPreferredProjection: () => 'text' as const,
    getPreviewBaseUrl: () => undefined,
    getSceneSelection: () => undefined,
    getSession(path: string) {
      return sessions.get(path)
    },
    getWorkspaceRootPath: () => undefined,
    hasSession(path: string) {
      return sessions.has(path)
    },
    messages: {
      fileSyncFailed: 'file sync failed',
      previewUnavailable: 'preview unavailable',
      unsupportedFile: 'unsupported file',
      workspaceUnavailable: 'workspace unavailable',
    },
    patchSceneSelection: vi.fn(),
    scheduleAutoSave,
    setSession(path: string, nextSession: EditorSession) {
      sessions.set(path, nextSession)
    },
    setTabError: vi.fn(),
    setTabLoading: vi.fn(),
    setTabModified: vi.fn(),
    syncScenePreview: vi.fn(),
  } satisfies Omit<EditorFileLifecycleContext, 'readTextDocumentFile' | 'syncStateFromDocument'>

  const context = {
    ...baseContext,
    ...contextOverrides,
    readTextDocumentFile: providedReadTextDocumentFile ?? defaultReadTextDocumentFile,
    syncStateFromDocument,
  } satisfies EditorFileLifecycleContext

  return {
    cancelAutoSave,
    context,
    path,
    scheduleAutoSave,
    session,
    syncStateFromDocument,
  }
}

async function waitUntil(
  description: string,
  predicate: () => boolean,
  stableCycles: number = 1,
  remainingCycles: number = 20,
  matchedCycles: number = 0,
) {
  if (remainingCycles <= 0) {
    throw new TypeError(`timed out waiting for ${description}`)
  }

  const nextMatchedCycles = predicate() ? matchedCycles + 1 : 0
  if (nextMatchedCycles >= stableCycles) {
    return
  }

  await Promise.resolve()
  return waitUntil(description, predicate, stableCycles, remainingCycles - 1, nextMatchedCycles)
}

describe('handleFileModifiedEvent 行为', () => {
  beforeEach(() => {
    modalOpenMock.mockReset()
  })

  it('外部文件内容与当前脏草稿一致时直接提升为新基线而不弹冲突对话框', async () => {
    const {
      cancelAutoSave,
      context,
      scheduleAutoSave,
      session,
      syncStateFromDocument,
    } = createContextHarness()

    await handleFileModifiedEvent(context, {
      path: DOC_PATH,
    })

    expect(modalOpenMock).not.toHaveBeenCalled()
    expect(cancelAutoSave).not.toHaveBeenCalled()
    expect(scheduleAutoSave).not.toHaveBeenCalled()
    expect(syncStateFromDocument).toHaveBeenCalledWith(DOC_PATH)
    expect(session.document.savedTextContent).toBe(DIRTY_CONTENT)
    expect(session.textState.isDirty).toBe(false)
  })

  it('冲突处理阶段抛错时恢复原有的自动保存计划', async () => {
    modalOpenMock.mockImplementation((_name: string, payload: Record<string, () => void>) => {
      payload.onLoadExternal?.()
    })

    const syncStateFromDocument = vi.fn(() => {
      throw new Error('sync failed')
    })
    const {
      cancelAutoSave,
      context,
      path,
      scheduleAutoSave,
    } = createContextHarness({
      autoSavePending: true,
      externalContent: '[{"duration":360}]',
      syncStateFromDocument,
    })

    await handleFileModifiedEvent(context, { path })

    expect(cancelAutoSave).toHaveBeenCalledWith(path)
    expect(scheduleAutoSave).toHaveBeenCalledWith(path)
    expect(context.setTabError).toHaveBeenCalledWith(path, context.messages.fileSyncFailed)
  })

  it('重命名后沿用原文件修改队列，避免同一会话并发处理', async () => {
    const oldPath = '/game/animation/rename-old.json'
    const newPath = '/game/animation/rename-new.json'
    let resolveOldRead:
      | ((value: { ok: true, content: string, metadata: ReturnType<typeof createTextMetadata> }) => void)
      | undefined

    const oldReadResult = {
      ok: true as const,
      content: DIRTY_CONTENT,
      metadata: createTextMetadata(),
    }

    const readTextDocumentFile = vi.fn((path: string) => {
      if (path === oldPath) {
        return new Promise<typeof oldReadResult>((resolve) => {
          resolveOldRead = resolve
        })
      }

      return Promise.resolve({
        ok: true as const,
        content: DIRTY_CONTENT,
        metadata: createTextMetadata(),
      })
    })

    const { context } = createContextHarness({
      path: oldPath,
      readTextDocumentFile,
    })

    const oldTask = handleFileModifiedEvent(context, { path: oldPath })
    await waitUntil(
      'old file read to reach suspended state',
      () => readTextDocumentFile.mock.calls.length === 1 && resolveOldRead !== undefined,
    )

    expect(readTextDocumentFile).toHaveBeenCalledTimes(1)
    expect(readTextDocumentFile).toHaveBeenNthCalledWith(1, oldPath)

    handleFileRenamedEvent(context, {
      newPath,
      oldPath,
    })

    const newTask = handleFileModifiedEvent(context, { path: newPath })
    await waitUntil(
      'renamed file read to remain queued behind the previous task',
      () => readTextDocumentFile.mock.calls.length === 1,
      3,
    )

    expect(readTextDocumentFile).toHaveBeenCalledTimes(1)

    resolveOldRead?.(oldReadResult)
    await oldTask
    await newTask

    expect(readTextDocumentFile).toHaveBeenCalledTimes(2)
    expect(readTextDocumentFile).toHaveBeenNthCalledWith(2, newPath)
  })
})
