import { readFile } from '@tauri-apps/plugin-fs'
import { defineStore } from 'pinia'

import { useFileSystemEvents } from '~/composables/useFileSystemEvents'
import { decodeTextFile } from '~/domain/document/file-codec'
import { computeLineNumberFromStatementId } from '~/domain/document/scene-selection'
import { createPreviewMediaSession, normalizePreviewMediaSessionPatch } from '~/features/editor/preview/preview-media-session'
import { useTabsWatcher } from '~/features/editor/shared/useTabsWatcher'
import { debugCommander } from '~/services/debug-commander'
import { getAssetUrl } from '~/services/platform/asset-url'
import { useEditSettingsStore } from '~/stores/edit-settings'
import { canExecuteEditorAutoSave, createEditorAutoSaveController } from '~/stores/editor-auto-save'
import { createEditorPreviewSync } from '~/stores/editor-preview-sync'
import { usePreferenceStore } from '~/stores/preference'
import { useTabsStore } from '~/stores/tabs'
import { useWorkspaceStore } from '~/stores/workspace'
import { AppError } from '~/types/errors'
import { handleError } from '~/utils/error-handler'

import { createEditorDocumentActions } from './internal/editor-document-actions'
import { createEditorDocumentSaveSnapshot, saveEditorDocument } from './internal/editor-document-save'
import { DocumentState, resolveSceneCursor } from './internal/editor-document-state'
import {
  handleFileModifiedEvent as handleFileModifiedEventAction,
  handleFileRenamedEvent as handleFileRenamedEventAction,
  loadEditorState as loadEditorStateAction,
} from './internal/editor-file-lifecycle'
import { createSceneSelectionActions } from './internal/editor-scene-selection'
import {
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

async function readTextDocumentFile(path: string): Promise<ReadTextDocumentResult> {
  const bytes = await readFile(path)
  return decodeTextFile(bytes)
}

export const useEditorStore = defineStore('editor', () => {
  const sessions = shallowReactive(new Map<string, EditorSession>())
  const saveHooks = new Map<string, (path: string) => Promise<void> | void>()

  function getSession(path: string): EditorSession | undefined {
    return sessions.get(path)
  }

  function getEditableSession(path: string): EditableEditorSession | undefined {
    const session = sessions.get(path)
    return session?.type === 'editable' ? session : undefined
  }

  function getTextProjectionState(path: string): TextProjectionState | undefined {
    return getEditableSession(path)?.textState
  }

  function getVisualProjectionState(path: string): VisualProjectionState | undefined {
    return getEditableSession(path)?.visualState
  }

  function getEditableState(path: string): EditableEditorState | undefined {
    const session = getEditableSession(path)
    if (!session) {
      return undefined
    }

    if (session.activeProjection === 'visual' && session.visualState) {
      return session.visualState
    }

    return session.textState
  }

  function getDocumentState(path: string): DocumentState | undefined {
    return getEditableSession(path)?.document
  }

  function canUndoDocument(path: string): boolean {
    return getDocumentState(path)?.canUndo ?? false
  }

  function canRedoDocument(path: string): boolean {
    return getDocumentState(path)?.canRedo ?? false
  }

  function hasState(path: string): boolean {
    return sessions.has(path)
  }

  function getPreviewMediaSession(path: string): PreviewMediaSession | undefined {
    const session = getSession(path)
    return session?.type === 'preview' ? session.previewMediaSession : undefined
  }

  function updatePreviewMediaSession(path: string, patch: Partial<PreviewMediaSession>) {
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

  function getState(path: string): EditorState | undefined {
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

  function syncStateFromDocument(path: string) {
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

  function setTextProjectionDraft(path: string, textContent: string, syncError?: TextProjectionState['syncError']) {
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
  const tabsStore = useTabsStore()
  const fileSystemEvents = useFileSystemEvents()

  const currentState = $computed(() => getState(tabsStore.activeTab?.path ?? ''))
  const currentTextProjection = $computed(() => getTextProjectionState(tabsStore.activeTab?.path ?? ''))
  const currentVisualProjection = $computed(() => getVisualProjectionState(tabsStore.activeTab?.path ?? ''))
  const currentSceneSelection = $computed(() => getSceneSelection(tabsStore.activeTab?.path ?? ''))
  const currentSelectedSceneStatement = $computed(() => getSelectedSceneStatement(tabsStore.activeTab?.path ?? ''))
  const currentSelectedSceneStatementIndex = $computed(() => getSceneSelectionIndex(tabsStore.activeTab?.path ?? ''))
  const currentSelectedSceneStatementPreviousSpeaker = $computed(() =>
    getSelectedSceneStatementPreviousSpeaker(tabsStore.activeTab?.path ?? ''),
  )

  const canToggleMode = $computed(() =>
    currentVisualProjection !== undefined,
  )

  function updateTabModified(path: string, isModified: boolean) {
    const tabIndex = tabsStore.findTabIndex(path)
    if (tabIndex === -1) {
      return
    }

    tabsStore.updateTabModified(tabIndex, isModified)
  }

  function syncTabModified(path: string) {
    updateTabModified(path, !!getEditableState(path)?.isDirty)
  }

  function updateTabLoading(path: string, isLoading: boolean) {
    const tabIndex = tabsStore.findTabIndex(path)
    if (tabIndex === -1) {
      return
    }

    tabsStore.updateTabLoading(tabIndex, isLoading)
  }

  function updateTabError(path: string, error?: string) {
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
  function syncScenePreview(path: string, lineNumber: number, lineText: string, force: boolean = false) {
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

  async function runSaveHook(path: string): Promise<void> {
    await saveHooks.get(path)?.(path)
  }

  function runPostSaveEffects(
    path: string,
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
    saveDocument: saveFile,
  })

  function canReschedulePendingAutoSave(state: EditableEditorState): boolean {
    return canExecuteEditorAutoSave(state)
  }

  function cancelAutoSave(path: string) {
    autoSaveController.cancel(path)
  }

  function cancelAllAutoSave() {
    autoSaveController.cancelAll()
  }

  function scheduleAutoSave(path: string) {
    autoSaveController.schedule(path)
  }

  function scheduleAutoSaveIfEnabled(path: string) {
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

  function registerSaveHook(path: string, hook: (path: string) => Promise<void> | void) {
    saveHooks.set(path, hook)
  }

  function unregisterSaveHook(path: string, hook?: (path: string) => Promise<void> | void) {
    const registeredHook = saveHooks.get(path)
    if (!registeredHook) {
      return
    }

    if (hook && registeredHook !== hook) {
      return
    }

    saveHooks.delete(path)
  }

  async function saveFile(path: string) {
    cancelAutoSave(path)
    // 在 await 前冻结当前保存快照，避免保存期间的新编辑被误并入本次保存并清除脏标记。
    const saveSnapshot = createEditorDocumentSaveSnapshot(documentSaveContext, path)
    await runSaveHook(path)
    const savedContent = await saveEditorDocument(documentSaveContext, path, saveSnapshot)
    runPostSaveEffects(path, savedContent, saveSnapshot.docEntry.model.kind)
    await runSaveHook(path)
  }

  const fileLifecycleContext = {
    ...documentActionContext,
    autoSaveHasPending: path => autoSaveController.hasPending(path),
    cancelAutoSave,
    canReschedulePendingAutoSave,
    createEditorError,
    getActiveTabPath: () => tabsStore.activeTab?.path,
    getAssetUrl,
    getEditableSession,
    getEditableState,
    getPreferredProjection: () => usePreferenceStore().editorMode,
    getPreviewBaseUrl: () => useWorkspaceStore().currentGameServeUrl,
    getSceneSelection,
    getSession: (path: string) => sessions.get(path),
    getWorkspaceRootPath: () => useWorkspaceStore().CWD,
    hasSession: (path: string) => sessions.has(path),
    messages: {
      fileSyncFailed: editorMessages.fileSyncFailed,
      previewUnavailable: editorMessages.previewUnavailable,
      unsupportedFile: editorMessages.unsupportedFile,
      workspaceUnavailable: editorMessages.workspaceUnavailable,
    },
    patchSceneSelection,
    readTextDocumentFile,
    scheduleAutoSave,
    setTabError: updateTabError,
    setTabLoading: updateTabLoading,
    setTabModified: updateTabModified,
    setSession: (path: string, session: EditorSession) => sessions.set(path, session),
    deleteSession: (path: string) => sessions.delete(path),
    syncScenePreview,
  } satisfies EditorFileLifecycleContext

  function setActiveProjection(projection: 'text' | 'visual', targetPath?: string): boolean {
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

  function switchEditorMode(mode: 'text' | 'visual', targetPath?: string) {
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
    path: string,
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

  function syncActiveScenePreview(path: string) {
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

  // 监听文件修改事件，如果文件未编辑，同步新文件内容
  fileSystemEvents.on('file:modified', async (event) => {
    await handleFileModifiedEventAction(fileLifecycleContext, event)
  })

  // 当前活跃文件是否为场景文件
  const isCurrentSceneFile = $computed(() =>
    currentState !== undefined && isEditableEditor(currentState) && currentState.kind === 'scene',
  )
  const isCurrentAnimationFile = $computed(() =>
    currentState !== undefined && isEditableEditor(currentState) && currentState.kind === 'animation',
  )

  return $$({
    hasState,
    getState,
    getPreviewMediaSession,
    canUndoDocument,
    canRedoDocument,
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
