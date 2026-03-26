import { stat } from '@tauri-apps/plugin-fs'

import { fsCmds } from '~/commands/fs'
import { mime } from '~/plugins/mime'
import { consumePendingDocumentWrite } from '~/services/document-write-intents'
import { gameAssetDir } from '~/services/platform/app-paths'
import { useModalStore } from '~/stores/modal'

import { applyDocumentTransaction } from './editor-document-actions'
import { createLoadedDocumentState, markDocumentClean, resolveSceneCursor } from './editor-document-state'
import { applyLoadedDocumentState, createEditableSession, getTextProjectionPersistedContent } from './editor-session'

import type { DocumentStateAccessor, DocumentStateSyncActions } from './editor-document-actions'
import type { DocumentState } from './editor-document-state'
import type {
  AssetPreviewState,
  EditableEditorSession,
  EditableEditorState,
  EditorSession,
  UnsupportedState,
} from './editor-session'
import type { DocumentKind, TextMetadata } from '~/domain/document/document-model'
import type { DecodeTextFileResult } from '~/domain/document/file-codec'
import type { SceneSelectionState } from '~/domain/document/scene-selection'
import type { AppError } from '~/types/errors'

export type ReadTextDocumentResult = DecodeTextFileResult

export interface FileRenamedEvent {
  newPath: string
  oldPath: string
}

export interface FileModifiedEvent {
  path: string
}

export interface SessionAccessor {
  getSession: (path: string) => EditorSession | undefined
  setSession: (path: string, session: EditorSession) => void
  deleteSession: (path: string) => void
  hasSession: (path: string) => boolean
  getEditableSession: (path: string) => EditableEditorSession | undefined
  getEditableState: (path: string) => EditableEditorState | undefined
}

export interface AutoSaveAccessor {
  autoSaveHasPending: (path: string) => boolean
  cancelAutoSave: (path: string) => void
  canReschedulePendingAutoSave: (state: EditableEditorState) => boolean
  scheduleAutoSave: (path: string) => void
}

export interface EditorFileLifecycleMessages {
  fileSyncFailed: string
  previewUnavailable: string
  unsupportedFile: string
  workspaceUnavailable: string
}

export interface EditorFileLifecycleContext extends
  DocumentStateAccessor,
  DocumentStateSyncActions,
  SessionAccessor,
  AutoSaveAccessor {
  createEditorError: (message: string) => AppError
  getActiveTabPath: () => string | undefined
  getAssetUrl: (path: string) => string
  getPreferredProjection: () => 'text' | 'visual'
  getPreviewBaseUrl: () => string | undefined
  getSceneSelection: (path: string) => SceneSelectionState | undefined
  getWorkspaceRootPath: () => string | undefined
  patchSceneSelection: (path: string, patch: Partial<SceneSelectionState>) => void
  readTextDocumentFile: (path: string) => Promise<ReadTextDocumentResult>
  setTabError: (path: string, error?: string) => void
  setTabLoading: (path: string, isLoading: boolean) => void
  setTabModified: (path: string, isModified: boolean) => void
  messages: EditorFileLifecycleMessages
  syncScenePreview: (path: string, lineNumber: number, lineText: string, force?: boolean) => void
}

interface ExternalDocumentSnapshot {
  allowMerge: boolean
  content: string
  currentContent: string
  hasSameContent: boolean
  hasSameMetadata: boolean
  metadata: TextMetadata
  session: EditableEditorSession
  state: EditableEditorState
}

const pendingFileModifiedTasks = new Map<string, Promise<void>>()

function isPathInsideDirectory(path: string, directoryPath: string): boolean {
  return path.startsWith(`${directoryPath}\\`) || path.startsWith(`${directoryPath}/`)
}

function createPreviewSession(state: AssetPreviewState): EditorSession {
  return shallowReactive({
    type: 'preview',
    state: reactive(state),
    previewMediaSession: undefined,
  }) as EditorSession
}

function createUnsupportedSession(state: UnsupportedState): EditorSession {
  return shallowReactive({
    type: 'unsupported',
    state: reactive(state),
  }) as EditorSession
}

function requirePreviewBaseUrl(context: EditorFileLifecycleContext): string {
  const previewBaseUrl = context.getPreviewBaseUrl()
  if (!previewBaseUrl) {
    throw context.createEditorError(context.messages.previewUnavailable)
  }

  return previewBaseUrl
}

function requireWorkspaceRootPath(context: EditorFileLifecycleContext): string {
  const workspaceRootPath = context.getWorkspaceRootPath()
  if (!workspaceRootPath) {
    throw context.createEditorError(context.messages.workspaceUnavailable)
  }

  return workspaceRootPath
}

async function loadNonEditableState(
  context: EditorFileLifecycleContext,
  path: string,
  mimeType: string,
): Promise<AssetPreviewState | UnsupportedState | undefined> {
  if (['image/', 'video/', 'audio/'].some(prefix => mimeType.startsWith(prefix))) {
    requireWorkspaceRootPath(context)
    requirePreviewBaseUrl(context)

    let fileSize: number | undefined
    try {
      const fileStat = await stat(path)
      fileSize = fileStat.size
    } catch {
      // 获取文件大小失败时忽略，不影响预览
    }

    return {
      path,
      view: 'preview',
      assetUrl: context.getAssetUrl(path),
      mimeType,
      fileSize,
    }
  }

  try {
    const isBinary = await fsCmds.isBinaryFile(path)
    if (!isBinary) {
      return undefined
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    throw context.createEditorError(`检测文件类型失败: ${msg}`)
  }

  return {
    path,
    view: 'unsupported',
  }
}

async function checkFileLocation(
  context: EditorFileLifecycleContext,
  path: string,
  subPath: string,
): Promise<boolean> {
  const targetPath = await gameAssetDir(requireWorkspaceRootPath(context), subPath)
  return isPathInsideDirectory(path, targetPath)
}

async function checkFileType(
  context: EditorFileLifecycleContext,
  path: string,
  subPath: string,
  mimeType: string,
  expectedMimeType: string,
): Promise<boolean> {
  if (mimeType !== expectedMimeType) {
    return false
  }

  return checkFileLocation(context, path, subPath)
}

function isTemplateStyleFile(path: string): boolean {
  const normalizedPath = path.toLowerCase()
  return normalizedPath.endsWith('.css') || normalizedPath.endsWith('.scss')
}

function isAnimationIndexFile(path: string): boolean {
  return path.replaceAll('\\', '/').toLowerCase().endsWith('/game/animation/animationtable.json')
}

async function resolveDocumentKind(
  context: EditorFileLifecycleContext,
  path: string,
  mimeType: string,
): Promise<DocumentKind> {
  if (await checkFileType(context, path, 'scene', mimeType, 'text/plain')) {
    return 'scene'
  }

  if (
    !isAnimationIndexFile(path)
    && await checkFileType(context, path, 'animation', mimeType, 'application/json')
  ) {
    return 'animation'
  }

  if (isTemplateStyleFile(path) && await checkFileLocation(context, path, 'template')) {
    return 'template'
  }

  return 'plaintext'
}

async function loadEditableDocumentState(
  context: EditorFileLifecycleContext,
  path: string,
  mimeType: string,
): Promise<void> {
  const loadedDocument = await context.readTextDocumentFile(path)
  if (!loadedDocument.ok) {
    context.setSession(path, createUnsupportedSession({
      path,
      view: 'unsupported',
    }))
    return
  }

  const { content, metadata } = loadedDocument
  const documentKind = await resolveDocumentKind(context, path, mimeType)

  try {
    context.setSession(
      path,
      createEditableSession(
        path,
        createLoadedDocumentState(documentKind, content, metadata),
        context.getPreferredProjection(),
      ),
    )
  } catch (error) {
    logger.warn(`创建文档模型失败 (${path}): ${error}`)
    throw context.createEditorError(`文档模型初始化失败: ${path}`)
  }
}

function replaceDocumentModelFromExternal(
  context: EditorFileLifecycleContext,
  path: string,
  content: string,
  metadata: TextMetadata,
): void {
  const session = context.getEditableSession(path)
  if (!session) {
    return
  }

  const docEntry = session.document
  const loadedState = createLoadedDocumentState(docEntry.model.kind, content, metadata)

  // 外部内容一旦成为新的基线版本，旧撤销链必须整体失效，
  // 否则 undo 会把替换前的本地事务回放到新文档上。
  docEntry.engine.reset()
  markDocumentClean(docEntry)

  applyLoadedDocumentState(session, loadedState, session.activeProjection)
  context.syncStateFromDocument(path)
}

function mergeExternalDocumentContent(localContent: string, externalContent: string): string {
  return [
    '<<<<<<< LOCAL',
    localContent,
    '=======',
    externalContent,
    '>>>>>>> EXTERNAL',
  ].join('\n')
}

function isSameTextMetadata(left: TextMetadata, right: TextMetadata): boolean {
  return left.encoding === right.encoding && left.lineEnding === right.lineEnding
}

function updateSavedDocumentMetadataBaseline(
  docEntry: DocumentState,
  content: string,
  metadata: TextMetadata,
): void {
  docEntry.savedTextContent = content
  docEntry.model = {
    ...docEntry.model,
    metadata: { ...metadata },
  }
}
function syncScenePreviewForExternalContent(
  context: EditorFileLifecycleContext,
  path: string,
  content: string,
  kind: DocumentKind,
): void {
  if (context.getActiveTabPath() !== path || kind !== 'scene') {
    return
  }

  const session = context.getEditableSession(path)
  const lineNumber = session?.sceneSelection?.lastLineNumber
  const sceneCursor = resolveSceneCursor(content, lineNumber)
  context.syncScenePreview(path, sceneCursor.lineNumber, sceneCursor.lineText)
}

async function confirmExternalDocumentChange(
  path: string,
  allowMerge: boolean,
): Promise<'keep-local' | 'load-external' | 'merge' | 'cancel'> {
  const modalStore = useModalStore()

  return new Promise((resolve) => {
    modalStore.open('ExternalDocumentChangeModal', {
      path,
      allowMerge,
      onKeepLocal: () => resolve('keep-local'),
      onLoadExternal: () => resolve('load-external'),
      onMerge: () => resolve('merge'),
      onCancel: () => resolve('cancel'),
    }, `external-document-change-${path}-${Date.now()}`)
  })
}

async function loadExternalDocumentSnapshot(
  context: EditorFileLifecycleContext,
  path: string,
): Promise<ExternalDocumentSnapshot | undefined> {
  const loadedDocument = await context.readTextDocumentFile(path)
  if (!loadedDocument.ok) {
    logger.warn(`外部文件已切换为不支持的文本编码，保留当前编辑态: ${path}`)
    context.setTabError(path, context.messages.unsupportedFile)
    return
  }

  const { content, metadata } = loadedDocument
  context.setTabError(path, undefined)
  if (consumePendingDocumentWrite(path, content, metadata)) {
    return
  }

  const state = context.getEditableState(path)
  if (!state) {
    return
  }

  const session = context.getEditableSession(path)
  if (!session) {
    return
  }

  const docEntry = session.document
  const currentContent = state.isDirty
    ? getTextProjectionPersistedContent(docEntry, session.textState)
    : docEntry.savedTextContent

  return {
    allowMerge: session.activeProjection === 'text' && state.kind !== 'animation',
    content,
    currentContent,
    hasSameContent: content === currentContent,
    hasSameMetadata: isSameTextMetadata(docEntry.model.metadata, metadata),
    metadata,
    session,
    state,
  }
}

function applyExternalDocumentSnapshot(
  context: EditorFileLifecycleContext,
  path: string,
  snapshot: ExternalDocumentSnapshot,
): void {
  const docEntry = snapshot.session.document
  if (snapshot.hasSameContent) {
    updateSavedDocumentMetadataBaseline(docEntry, snapshot.content, snapshot.metadata)
    markDocumentClean(docEntry)
    context.syncStateFromDocument(path)
    return
  }

  replaceDocumentModelFromExternal(context, path, snapshot.content, snapshot.metadata)
  syncScenePreviewForExternalContent(context, path, snapshot.content, snapshot.state.kind)
}

function restorePendingAutoSaveIfNeeded(
  context: EditorFileLifecycleContext,
  path: string,
  hadPendingAutoSave: boolean,
): void {
  if (!hadPendingAutoSave) {
    return
  }

  const state = context.getEditableState(path)
  if (state && context.canReschedulePendingAutoSave(state)) {
    context.scheduleAutoSave(path)
  }
}

function migratePendingFileModifiedTask(oldPath: string, newPath: string): void {
  const pendingTask = pendingFileModifiedTasks.get(oldPath)
  if (!pendingTask) {
    return
  }

  pendingFileModifiedTasks.delete(oldPath)

  const migratedTask = pendingTask.finally(() => {
    if (pendingFileModifiedTasks.get(newPath) === migratedTask) {
      pendingFileModifiedTasks.delete(newPath)
    }
  })
  pendingFileModifiedTasks.set(newPath, migratedTask)
}

async function handleFileModifiedEventInternal(
  context: EditorFileLifecycleContext,
  event: FileModifiedEvent,
): Promise<void> {
  const state = context.getEditableState(event.path)
  if (!state) {
    return
  }

  const snapshot = await loadExternalDocumentSnapshot(context, event.path)
  if (!snapshot) {
    return
  }

  if (!snapshot.state.isDirty || snapshot.hasSameContent) {
    applyExternalDocumentSnapshot(context, event.path, snapshot)
    return
  }

  const hadPendingAutoSave = context.autoSaveHasPending(event.path)
  context.cancelAutoSave(event.path)
  let shouldRestoreAutoSave = true

  try {
    const action = await confirmExternalDocumentChange(event.path, snapshot.allowMerge)
    if (action === 'cancel' || action === 'keep-local') {
      return
    }

    if (action === 'load-external' || !snapshot.state.isDirty) {
      applyExternalDocumentSnapshot(context, event.path, snapshot)
      shouldRestoreAutoSave = false
      return
    }

    if (action === 'merge' && snapshot.allowMerge) {
      const docEntry = snapshot.session.document
      const mergedContent = mergeExternalDocumentContent(snapshot.currentContent, snapshot.content)
      snapshot.session.activeProjection = 'text'
      applyDocumentTransaction(context, event.path, {
        transaction: {
          type: 'replace-all',
          content: mergedContent,
          metadata: {
            encoding: snapshot.metadata.encoding,
            lineEnding: snapshot.metadata.lineEnding,
          },
        },
        inverse: {
          type: 'replace-all',
          content: snapshot.currentContent,
          metadata: {
            encoding: docEntry.model.metadata.encoding,
            lineEnding: docEntry.model.metadata.lineEnding,
          },
        },
        source: 'external',
      })
      shouldRestoreAutoSave = false
      return
    }
  } finally {
    if (shouldRestoreAutoSave) {
      restorePendingAutoSaveIfNeeded(context, event.path, hadPendingAutoSave)
    }
  }
}

export async function loadEditorState(
  context: EditorFileLifecycleContext,
  path: string,
): Promise<void> {
  if (context.hasSession(path)) {
    return
  }

  try {
    context.setTabLoading(path, true)
    context.setTabError(path, undefined)

    const mimeType = mime.getType(path) ?? ''
    const nonEditableState = await loadNonEditableState(context, path, mimeType)
    if (nonEditableState) {
      context.setSession(
        path,
        nonEditableState.view === 'preview'
          ? createPreviewSession(nonEditableState)
          : createUnsupportedSession(nonEditableState),
      )
      return
    }

    await loadEditableDocumentState(context, path, mimeType)
  } catch (error) {
    logger.error(`无法加载编辑器状态 ${path}: ${error}`)
    context.setTabError(path, error instanceof Error ? error.message : 'Unknown error')
  } finally {
    context.setTabLoading(path, false)
    context.setTabModified(path, false)
  }
}

export function handleFileRenamedEvent(
  context: EditorFileLifecycleContext,
  event: FileRenamedEvent,
): void {
  const hadPendingAutoSave = context.autoSaveHasPending(event.oldPath)
  context.cancelAutoSave(event.oldPath)

  const session = context.getSession(event.oldPath)
  if (session) {
    if (session.type === 'editable') {
      session.textState.path = event.newPath
      if (session.visualState) {
        session.visualState.path = event.newPath
      }
    } else {
      session.state.path = event.newPath
      if (session.type === 'preview') {
        try {
          session.state.assetUrl = context.getAssetUrl(event.newPath)
          context.setTabError(event.newPath, undefined)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          logger.warn(`资源预览地址更新失败 (${event.newPath}): ${message}`)
          context.setTabError(event.newPath, message)
        }
      }
    }

    context.deleteSession(event.oldPath)
    context.setSession(event.newPath, session)
  }

  const renamedState = context.getEditableState(event.newPath)
  if (hadPendingAutoSave && renamedState && context.canReschedulePendingAutoSave(renamedState)) {
    context.scheduleAutoSave(event.newPath)
  }

  migratePendingFileModifiedTask(event.oldPath, event.newPath)
}

export async function handleFileModifiedEvent(
  context: EditorFileLifecycleContext,
  event: FileModifiedEvent,
): Promise<void> {
  const previousTask = pendingFileModifiedTasks.get(event.path) ?? Promise.resolve()
  const task = previousTask
    .catch(() => undefined)
    .then(async () => {
      try {
        await handleFileModifiedEventInternal(context, event)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error(`同步文件内容失败 (${event.path}): ${message}`)
        context.setTabError(event.path, context.messages.fileSyncFailed)
      }
    })

  pendingFileModifiedTasks.set(event.path, task)

  try {
    await task
  } finally {
    if (pendingFileModifiedTasks.get(event.path) === task) {
      pendingFileModifiedTasks.delete(event.path)
    }
  }
}
