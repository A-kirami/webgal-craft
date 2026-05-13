import { readFile } from '@tauri-apps/plugin-fs'
import { defineStore } from 'pinia'

import { useFileSystemEvents } from '~/composables/useFileSystemEvents'
import { decodeTextFile } from '~/domain/document/file-codec'
import { computeLineNumberFromStatementId } from '~/domain/document/scene-selection'
import { AbsPath } from '~/domain/path'
import { createPreviewMediaSession, normalizePreviewMediaSessionPatch } from '~/features/editor/preview/preview-media-session'
import { useTabsWatcher } from '~/features/editor/shared/useTabsWatcher'
import { backupManager } from '~/services/backup-manager'
import { debugCommander } from '~/services/debug-commander'
import { getAssetUrl } from '~/services/platform/asset-url'
import { useEditSettingsStore } from '~/stores/edit-settings'
import { canExecuteEditorAutoSave, createEditorAutoSaveController } from '~/stores/editor-auto-save'
import { createEditorPreviewSync } from '~/stores/editor-preview-sync'
import { useFileStore } from '~/stores/file'
import { usePreferenceStore } from '~/stores/preference'
import { usePreviewSessionStore } from '~/stores/preview-session'
import { useTabsStore } from '~/stores/tabs'
import { useWorkspaceStore } from '~/stores/workspace'
import { AppError } from '~/types/errors'
import { handleError } from '~/utils/error-handler'

import { createEditorDocumentActions } from './internal/editor-document-actions'
import { createEditorDocumentSaveSnapshot, saveEditorDocument } from './internal/editor-document-save'
import {
  createLoadedDocumentState,
  DocumentState,
  getDocumentTextContent,
  isDocumentDirty,
  markDocumentClean,
  resolveSceneCursor,
} from './internal/editor-document-state'
import {
  handleDirectoryRenamedEvent as handleDirectoryRenamedEventAction,
  handleFileModifiedEvent as handleFileModifiedEventAction,
  handleFileRenamedEvent as handleFileRenamedEventAction,
  loadEditorState as loadEditorStateAction,
} from './internal/editor-file-lifecycle'
import { createSceneSelectionActions } from './internal/editor-scene-selection'
import {
  applyLoadedDocumentState,
  isEditableEditor,
  isSceneVisualProjection,
  isTextProjectionDirty,
  normalizeAnimationTextProjection,
  syncProjectionStateFromDocument,
} from './internal/editor-session'

import type { EditorDocumentActionContext } from './internal/editor-document-actions'
import type { EditorDocumentSaveContext } from './internal/editor-document-save'
import type { EditorFileLifecycleContext, ReadTextDocumentResult } from './internal/editor-file-lifecycle'
import type {
  EditableEditorSession,
  EditableEditorState,
  EditorSession,
  EditorState,
  SceneProjectionActivation,
  TextProjectionState,
  VisualProjectionState,
} from './internal/editor-session'
import type { TextMetadata } from '~/domain/document/document-model'
import type { PreviewMediaSession } from '~/features/editor/preview/preview-media-session'

export {
  computeLineNumberFromStatementId,
  computeStatementIdFromLineNumber,
} from '~/domain/document/scene-selection'
export {
  isAnimationVisualProjection,
  isEditableEditor,
  isSceneVisualProjection,
} from './internal/editor-session'
export type { HistoryApplyResult } from './internal/editor-document-actions'
export type {
  AnimationVisualProjectionState,
  AssetPreviewState,
  EditableEditorState,
  SceneVisualProjectionState,
  TextProjectionState,
  UnsupportedState,
  VisualProjectionState,
} from './internal/editor-session'

const PREVIEW_SYNC_DEDUPE_WINDOW_MS = 160
const AUTO_SAVE_DEBOUNCE_MS = 500
const REVISION_HASH_MODULUS = 2 ** 32

function hashRevisionContent(content: string): string {
  let hash = 0
  for (const char of content) {
    hash = Math.trunc(Math.imul(31, hash) + (char.codePointAt(0) ?? 0)) % REVISION_HASH_MODULUS
  }
  return hash.toString(16)
}

function getEffectiveSceneBufferContent(session: EditableEditorSession): string {
  return session.textState.textSource === 'draft'
    ? session.textState.textContent
    : getDocumentTextContent(session.document)
}

function createSceneBufferRevision(session: EditableEditorSession): string {
  const content = getEffectiveSceneBufferContent(session)
  const { document, textState } = session
  return [
    document.historyRevision,
    document.engine.sequenceNumber,
    document.savedSequenceNumber,
    textState.textSource,
    content.length,
    hashRevisionContent(content),
  ].join(':')
}

async function readTextDocumentFile(path: AbsPath): Promise<ReadTextDocumentResult> {
  const fileStore = useFileStore()
  const physicalPath = fileStore.isVfs ? await fileStore.resolveFilePath(path) : path
  const bytes = await readFile(physicalPath)
  return decodeTextFile(bytes)
}

export const useEditorStore = defineStore('editor', () => {
  const sessions = shallowReactive(new Map<AbsPath, EditorSession>())
  const saveHooks = new Map<AbsPath, (path: AbsPath) => Promise<void> | void>()

  function getSession(path: AbsPath): EditorSession | undefined {
    return sessions.get(path)
  }

  function getEditableSession(path: AbsPath): EditableEditorSession | undefined {
    const session = sessions.get(path)
    return session?.type === 'editable' ? session : undefined
  }

  function getTextProjectionState(path: AbsPath): TextProjectionState | undefined {
    return getEditableSession(path)?.textState
  }

  function getVisualProjectionState(path: AbsPath): VisualProjectionState | undefined {
    return getEditableSession(path)?.visualState
  }

  function getEditableState(path: AbsPath): EditableEditorState | undefined {
    const session = getEditableSession(path)
    if (!session) {
      return undefined
    }

    if (session.activeProjection === 'visual' && session.visualState) {
      return session.visualState
    }

    return session.textState
  }

  function getDocumentState(path: AbsPath): DocumentState | undefined {
    return getEditableSession(path)?.document
  }

  /** 若文档已打开且有未保存改动，返回当前 buffer 文本；否则返回 undefined。 */
  function getDirtyBufferContent(path: AbsPath): string | undefined {
    const document = getDocumentState(path)
    if (!document || !isDocumentDirty(document)) {
      return undefined
    }
    return getDocumentTextContent(document)
  }

  function peekSceneBuffer(path: AbsPath): { content: string, metadata: TextMetadata, revision: string } | undefined {
    const session = getEditableSession(path)
    if (!session || session.document.model.kind !== 'scene') {
      return undefined
    }

    if (!isTextProjectionDirty(session.document, session.textState)) {
      return undefined
    }

    return {
      content: getEffectiveSceneBufferContent(session),
      metadata: { ...session.document.model.metadata },
      revision: createSceneBufferRevision(session),
    }
  }

  function peekSceneRevision(path: AbsPath): string | undefined {
    const session = getEditableSession(path)
    if (!session || session.document.model.kind !== 'scene') {
      return undefined
    }

    return createSceneBufferRevision(session)
  }

  function applySystemRefactor(
    path: AbsPath,
    content: string,
    metadata: TextMetadata,
    expectedRevision: number | string,
  ): boolean {
    const session = getEditableSession(path)
    if (!session || session.document.model.kind !== 'scene') {
      return false
    }

    if (createSceneBufferRevision(session) !== String(expectedRevision)) {
      return false
    }

    const loadedState = createLoadedDocumentState('scene', content, metadata)
    if (session.textState.textSource === 'draft') {
      loadedState.textProjection = {
        content,
        source: 'draft',
      }
    }

    applyLoadedDocumentState(session, loadedState, session.activeProjection)
    markDocumentClean(session.document)
    syncStateFromDocument(path)
    return true
  }

  function canUndoDocument(path: AbsPath): boolean {
    return getDocumentState(path)?.canUndo ?? false
  }

  function canRedoDocument(path: AbsPath): boolean {
    return getDocumentState(path)?.canRedo ?? false
  }

  function hasState(path: AbsPath): boolean {
    return sessions.has(path)
  }

  function getPreviewMediaSession(path: AbsPath): PreviewMediaSession | undefined {
    const session = getSession(path)
    return session?.type === 'preview' ? session.previewMediaSession : undefined
  }

  function updatePreviewMediaSession(path: AbsPath, patch: Partial<PreviewMediaSession>) {
    const session = getSession(path)
    if (!session || session.type !== 'preview') {
      return
    }

    const normalizedPatch = normalizePreviewMediaSessionPatch(patch)
    if (Object.keys(normalizedPatch).length === 0) {
      return
    }

    if (session.previewMediaSession) {
      Object.assign(session.previewMediaSession, normalizedPatch)
      return
    }

    session.previewMediaSession = reactive(createPreviewMediaSession(normalizedPatch)) as PreviewMediaSession
  }

  function getState(path: AbsPath): EditorState | undefined {
    const session = getSession(path)
    if (!session) {
      return
    }

    if (session.type === 'preview' || session.type === 'unsupported') {
      return session.state
    }

    if (session.activeProjection === 'visual' && session.visualState) {
      return session.visualState
    }

    return session.textState
  }

  // ── 场景选择与展示状态（委托到 editor-scene-selection.ts）──

  const {
    getScenePresentationState,
    getSceneSelection,
    getSceneSelectionIndex,
    getSelectedSceneStatement,
    getSelectedSceneStatementPreviousSpeaker,
    isSceneStatementCollapsed,
    patchSceneSelection,
    reconcileScenePresentation,
    reconcileSceneSelection,
    setSceneStatementCollapsed,
    syncSceneSelectionFromStatement,
    syncSceneSelectionFromTextLine,
  } = createSceneSelectionActions(getEditableSession)

  function syncStateFromDocument(path: AbsPath) {
    reconcileSceneSelection(path)
    reconcileScenePresentation(path)

    const session = getEditableSession(path)
    if (session) {
      syncProjectionStateFromDocument(
        session.document,
        session.textState,
        session.visualState,
      )
    }

    syncTabModified(path)
  }

  function setTextProjectionDraft(path: AbsPath, textContent: string, syncError?: TextProjectionState['syncError']) {
    const session = getEditableSession(path)
    const state = session?.textState
    if (!state || !session) {
      return
    }

    state.textContent = textContent
    state.textSource = 'draft'
    state.syncError = syncError
    state.isDirty = isTextProjectionDirty(session.document, state)
    syncTabModified(path)
  }

  const { t } = useI18n()
  const editSettingsStore = useEditSettingsStore()
  const previewSessionStore = usePreviewSessionStore()
  const tabsStore = useTabsStore()
  const fileSystemEvents = useFileSystemEvents()

  const currentState = $computed(() => {
    const path = tabsStore.activeTab?.path
    return path ? getState(path) : undefined
  })
  const currentTextProjection = $computed(() => {
    const path = tabsStore.activeTab?.path
    return path ? getTextProjectionState(path) : undefined
  })
  const currentVisualProjection = $computed(() => {
    const path = tabsStore.activeTab?.path
    return path ? getVisualProjectionState(path) : undefined
  })
  const currentSceneSelection = $computed(() => {
    const path = tabsStore.activeTab?.path
    return path ? getSceneSelection(path) : undefined
  })
  const currentSelectedSceneStatement = $computed(() => {
    const path = tabsStore.activeTab?.path
    return path ? getSelectedSceneStatement(path) : undefined
  })
  const currentSelectedSceneStatementIndex = $computed(() => {
    const path = tabsStore.activeTab?.path
    return path ? getSceneSelectionIndex(path) : undefined
  })
  const currentSelectedSceneStatementPreviousSpeaker = $computed(() => {
    const path = tabsStore.activeTab?.path
    return path ? getSelectedSceneStatementPreviousSpeaker(path) : ''
  })

  const canToggleMode = $computed(() =>
    currentVisualProjection !== undefined,
  )

  function updateTabModified(path: AbsPath, isModified: boolean) {
    const tabIndex = tabsStore.findTabIndex(path)
    if (tabIndex === -1) {
      return
    }

    tabsStore.updateTabModified(tabIndex, isModified)
  }

  function syncTabModified(path: AbsPath) {
    updateTabModified(path, !!getEditableState(path)?.isDirty)
  }

  function updateTabLoading(path: AbsPath, isLoading: boolean) {
    const tabIndex = tabsStore.findTabIndex(path)
    if (tabIndex === -1) {
      return
    }

    tabsStore.updateTabLoading(tabIndex, isLoading)
  }

  function updateTabError(path: AbsPath, error?: string) {
    const tabIndex = tabsStore.findTabIndex(path)
    if (tabIndex === -1) {
      return
    }

    tabsStore.updateTabError(tabIndex, error)
  }

  const previewSyncController = createEditorPreviewSync({
    dedupeWindowMs: PREVIEW_SYNC_DEDUPE_WINDOW_MS,
    dispatch(path, lineNumber, lineText, force) {
      void debugCommander.syncScene(path, lineNumber, lineText, force)
    },
  })
  function syncScenePreview(path: AbsPath, lineNumber: number, lineText: string, force: boolean = false) {
    previewSyncController.syncScenePreview(path, lineNumber, lineText, force)
  }

  function createEditorError(message: string) {
    return new AppError('EDITOR_ERROR', message)
  }

  const editorMessages = {
    fileSyncFailed: t('edit.errors.fileSyncFailed'),
    previewUnavailable: t('edit.errors.previewUnavailable'),
    workspaceUnavailable: t('edit.errors.workspaceUnavailable'),
    unsupportedFile: t('edit.unsupported.unsupportedFile'),
  }

  const documentActionContext = {
    getDocumentState,
    getSceneSelection,
    getTextProjectionState,
    patchSceneSelection,
    syncStateFromDocument,
  } satisfies EditorDocumentActionContext

  const {
    applyAnimationFrameDelete,
    applyAnimationFrameInsert,
    applyAnimationFrameReorder,
    applyAnimationFrameUpdate,
    applySceneStatementDelete,
    applySceneStatementInsert,
    applySceneStatementReorder,
    applySceneStatementUpdate,
    applyTextDocumentContent,
    redoDocument,
    replaceTextDocumentContent,
    undoDocument,
  } = createEditorDocumentActions(documentActionContext)

  const documentSaveContext = {
    ...documentActionContext,
    createEditorError,
    getEditableState,
    getVisualProjectionState,
  } satisfies EditorDocumentSaveContext

  async function runSaveHook(path: AbsPath): Promise<void> {
    await saveHooks.get(path)?.(path)
  }

  function runPostSaveEffects(
    path: AbsPath,
    savedContent: string,
    savedKind: DocumentState['model']['kind'],
  ): void {
    switch (savedKind) {
      case 'scene': {
        const selection = getSceneSelection(path)
        const sceneCursor = resolveSceneCursor(savedContent, selection?.lastLineNumber)
        syncScenePreview(path, sceneCursor.lineNumber, sceneCursor.lineText)
        return
      }
      case 'template': {
        void debugCommander.refetchTemplates().catch((error) => {
          handleError(new AppError('EDITOR_ERROR', '刷新模板失败', { cause: error }), { silent: true })
        })
        return
      }
      default: {
        return
      }
    }
  }

  const autoSaveController = createEditorAutoSaveController({
    debounceMs: AUTO_SAVE_DEBOUNCE_MS,
    getState(path) {
      return getEditableState(path)
    },
    handleSaveError(error) {
      handleError(error, { silent: true })
    },
    saveDocument: path => saveFile(path, 'auto'),
  })

  function canReschedulePendingAutoSave(state: EditableEditorState): boolean {
    return canExecuteEditorAutoSave(state)
  }

  function cancelAutoSave(path: AbsPath) {
    autoSaveController.cancel(path)
  }

  function cancelAllAutoSave() {
    autoSaveController.cancelAll()
  }

  function scheduleAutoSave(path: AbsPath) {
    autoSaveController.schedule(path)
  }

  function scheduleAutoSaveIfEnabled(path: AbsPath) {
    if (!editSettingsStore.autoSave) {
      return
    }

    scheduleAutoSave(path)
  }

  // 关闭自动保存时立即清空 debounce 队列，避免已排队的保存越过开关执行。
  watch(
    () => editSettingsStore.autoSave,
    (isEnabled) => {
      if (!isEnabled) {
        cancelAllAutoSave()
      }
    },
    { flush: 'sync' },
  )

  function registerSaveHook(path: AbsPath, hook: (path: AbsPath) => Promise<void> | void) {
    saveHooks.set(path, hook)
  }

  function unregisterSaveHook(path: AbsPath, hook?: (path: AbsPath) => Promise<void> | void) {
    const registeredHook = saveHooks.get(path)
    if (!registeredHook) {
      return
    }

    if (hook && registeredHook !== hook) {
      return
    }

    saveHooks.delete(path)
  }

  async function saveFile(path: AbsPath, trigger: 'manual' | 'auto' = 'manual') {
    cancelAutoSave(path)
    // 在 await 前冻结当前保存快照，避免保存期间的新编辑被误并入本次保存并清除脏标记。
    const saveSnapshot = createEditorDocumentSaveSnapshot(documentSaveContext, path)
    await runSaveHook(path)
    const savedContent = await saveEditorDocument(documentSaveContext, path, saveSnapshot)
    runPostSaveEffects(path, savedContent, saveSnapshot.docEntry.model.kind)
    await runSaveHook(path)
    await maybeCreateSceneBackup(path, trigger)
  }

  async function maybeCreateSceneBackup(path: AbsPath, trigger: 'manual' | 'auto'): Promise<void> {
    const projectPath = useWorkspaceStore().CWD
    if (!projectPath) {
      return
    }
    const projectAbsPath = AbsPath.from(projectPath)
    const logicalPath = backupManager.toProjectRelative(projectAbsPath, path)
    if (!logicalPath) {
      return
    }
    if (!backupManager.isScenePath(logicalPath)) {
      return
    }
    const createBackup = trigger === 'manual'
      ? backupManager.createManualBackup
      : backupManager.createAutoBackup
    try {
      await createBackup(projectAbsPath, logicalPath)
    } catch (error) {
      // 备份失败不应阻断主保存流程，仅记录日志即可
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`[editor] 创建场景历史失败: ${message}`)
    }
  }

  const fileLifecycleContext = {
    ...documentActionContext,
    autoSaveHasPending: path => autoSaveController.hasPending(path),
    cancelAutoSave,
    canReschedulePendingAutoSave,
    collectSessionPaths: () => [...sessions.keys()],
    createEditorError,
    getActiveTabPath: () => tabsStore.activeTab?.path,
    getAssetUrl,
    getEditableSession,
    getEditableState,
    getPreferredProjection: () => usePreferenceStore().editorMode,
    getPreviewBaseUrl: () => previewSessionStore.currentGameServeUrl,
    getSceneSelection,
    getSession: (path: AbsPath) => sessions.get(path),
    getWorkspaceRootPath: () => useWorkspaceStore().CWD,
    hasSession: (path: AbsPath) => sessions.has(path),
    messages: {
      fileSyncFailed: editorMessages.fileSyncFailed,
      previewUnavailable: editorMessages.previewUnavailable,
      unsupportedFile: editorMessages.unsupportedFile,
      workspaceUnavailable: editorMessages.workspaceUnavailable,
    },
    patchSceneSelection,
    readTextDocumentFile,
    resolveFilePath: async (path: AbsPath) => {
      const fileStore = useFileStore()
      return fileStore.isVfs ? await fileStore.resolveFilePath(path) : path
    },
    scheduleAutoSave,
    setTabError: updateTabError,
    setTabLoading: updateTabLoading,
    setTabModified: updateTabModified,
    setSession: (path: AbsPath, session: EditorSession) => sessions.set(path, session),
    deleteSession: (path: AbsPath) => sessions.delete(path),
    syncScenePreview,
  } satisfies EditorFileLifecycleContext

  function setActiveProjection(projection: 'text' | 'visual', targetPath?: AbsPath): boolean {
    const path = targetPath ?? tabsStore.activeTab?.path
    if (!path) {
      return false
    }

    const session = getEditableSession(path)
    const state = getState(path)
    if (!session || !state || !isEditableEditor(state) || !session.visualState) {
      return false
    }

    if (state.projection === projection) {
      return true
    }

    const textState = getTextProjectionState(path)

    if (projection === 'text') {
      if (isSceneVisualProjection(state)) {
        const selection = getSceneSelection(path)
        const anchorStatementId = selection?.lastEditedStatementId ?? selection?.selectedStatementId
        let syncedLineNumber = selection?.lastLineNumber
        if (anchorStatementId !== undefined) {
          syncedLineNumber = computeLineNumberFromStatementId(
            state.statements,
            anchorStatementId,
          ) ?? selection?.lastLineNumber
        }
        patchSceneSelection(path, {
          lastLineNumber: syncedLineNumber,
        })
      }
      session.activeProjection = 'text'
    } else {
      const docEntry = session.document
      if (docEntry.model.kind === 'animation' && textState?.syncError === undefined) {
        normalizeAnimationTextProjection(session.textState, docEntry)
      }
      reconcileSceneSelection(path)
      session.activeProjection = 'visual'
    }

    return true
  }

  function switchEditorMode(mode: 'text' | 'visual', targetPath?: AbsPath) {
    const path = targetPath ?? tabsStore.activeTab?.path
    if (!path) {
      return
    }

    const currentState = getState(path)
    const previousProjection = currentState && isEditableEditor(currentState)
      ? currentState.projection
      : undefined

    if (!setActiveProjection(mode, path)) {
      return
    }

    const session = getEditableSession(path)
    if (session?.document.model.kind === 'scene' && previousProjection !== mode) {
      session.pendingSceneProjectionActivation = mode
    }

    usePreferenceStore().editorMode = mode
    tabsStore.shouldFocusEditor = true
  }

  function consumePendingSceneProjectionActivation(
    path: AbsPath,
    targetProjection: SceneProjectionActivation,
  ): boolean {
    const session = getEditableSession(path)
    const pendingActivation = session?.pendingSceneProjectionActivation
    if (!pendingActivation || pendingActivation !== targetProjection) {
      return false
    }

    session.pendingSceneProjectionActivation = undefined
    return true
  }

  function syncActiveScenePreview(path: AbsPath) {
    const session = getEditableSession(path)
    if (!session || session.document.model.kind !== 'scene') {
      return
    }

    if (getEditableState(path)?.isDirty) {
      return
    }

    const sceneCursor = resolveSceneCursor(session.document.savedTextContent, session.sceneSelection?.lastLineNumber)
    syncScenePreview(path, sceneCursor.lineNumber, sceneCursor.lineText)
  }

  watch(() => tabsStore.activeTab?.path, async (activePath) => {
    if (!activePath) {
      return
    }

    if (hasState(activePath)) {
      // 已加载的文件：同步编辑模式与全局偏好
      const preferenceStore = usePreferenceStore()
      setActiveProjection(preferenceStore.editorMode, activePath)
    } else {
      await loadEditorStateAction(fileLifecycleContext, activePath)
    }

    syncActiveScenePreview(activePath)
  }, { immediate: true })

  // 监听标签页关闭，清理编辑器状态
  useTabsWatcher((closedPath) => {
    cancelAutoSave(closedPath)
    saveHooks.delete(closedPath)
    sessions.delete(closedPath)
  })

  // 监听文件重命名事件，更新编辑器状态
  fileSystemEvents.on('file:renamed', (event) => {
    handleFileRenamedEventAction(fileLifecycleContext, event)
  })

  fileSystemEvents.on('directory:renamed', (event) => {
    handleDirectoryRenamedEventAction(fileLifecycleContext, event)
  })

  // 监听文件修改事件，如果文件未编辑，同步新文件内容
  fileSystemEvents.on('file:modified', async (event) => {
    await handleFileModifiedEventAction(fileLifecycleContext, event)
  })

  fileSystemEvents.on('file:written', () => {
    // 写盘回声只表示本地保存链路完成，编辑器内容已由保存或系统重构入口同步。
  })

  // 当前活跃文件是否为场景文件
  const isCurrentSceneFile = $computed(() =>
    currentState !== undefined && isEditableEditor(currentState) && currentState.kind === 'scene',
  )
  const isCurrentAnimationFile = $computed(() =>
    currentState !== undefined && isEditableEditor(currentState) && currentState.kind === 'animation',
  )

  function isDocumentPathWithinDirectory(path: AbsPath, directory: string): boolean {
    try {
      const normalizedDirectory = AbsPath.from(directory)

      if (AbsPath.equals(path, normalizedDirectory)) {
        return true
      }

      AbsPath.relativize(path, normalizedDirectory)
      return true
    } catch {
      return false
    }
  }

  function hasUnsavedDocumentsUnder(directory: string): boolean {
    for (const [path] of sessions) {
      if (isDocumentPathWithinDirectory(path, directory) && getEditableState(path)?.isDirty) {
        return true
      }
    }
    return false
  }

  function collectDocumentPathsUnder(directory: string): AbsPath[] {
    const matched: AbsPath[] = []
    for (const [path] of sessions) {
      if (isDocumentPathWithinDirectory(path, directory)) {
        matched.push(path)
      }
    }
    return matched
  }

  return $$({
    hasState,
    getState,
    getPreviewMediaSession,
    canUndoDocument,
    canRedoDocument,
    getDirtyBufferContent,
    peekSceneBuffer,
    peekSceneRevision,
    readTextDocumentFile,
    applySystemRefactor,
    hasUnsavedDocumentsUnder,
    collectDocumentPathsUnder,
    currentState,
    currentTextProjection,
    currentVisualProjection,
    currentSceneSelection,
    currentSelectedSceneStatement,
    currentSelectedSceneStatementIndex,
    currentSelectedSceneStatementPreviousSpeaker,
    getSceneSelection,
    getScenePresentationState,
    getSelectedSceneStatement,
    getSceneSelectionIndex,
    getSelectedSceneStatementPreviousSpeaker,
    isSceneStatementCollapsed,
    canToggleMode,
    isCurrentSceneFile,
    isCurrentAnimationFile,
    syncSceneSelectionFromTextLine,
    syncSceneSelectionFromStatement,
    setSceneStatementCollapsed,
    setActiveProjection,
    switchEditorMode,
    consumePendingSceneProjectionActivation,
    syncScenePreview,
    updatePreviewMediaSession,
    registerSaveHook,
    unregisterSaveHook,
    scheduleAutoSave,
    scheduleAutoSaveIfEnabled,
    saveFile,
    undoDocument,
    redoDocument,
    replaceTextDocumentContent,
    setTextProjectionDraft,
    applyAnimationFrameDelete,
    applyAnimationFrameInsert,
    applyAnimationFrameReorder,
    applyAnimationFrameUpdate,
    applySceneStatementDelete,
    applySceneStatementInsert,
    applySceneStatementReorder,
    applySceneStatementUpdate,
    applyTextDocumentContent,
  })
})
