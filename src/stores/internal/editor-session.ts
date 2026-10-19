import { serializeDocument } from '~/domain/document/serializer'
import { projectAnimationFrames, projectSceneStatements } from '~/domain/document/visual-projection'
import { StatementEntry } from '~/domain/script/sentence'
import { AnimationFrame } from '~/domain/stage/types'
import { createScenePresentationState } from '~/features/editor/shared/scene-presentation'

import {
  createDocumentState,
  getDocumentTextContent,
  invalidateDocumentTextCache,
  isDocumentDirty,
  syncDocumentHistoryState,
} from './editor-document-state'

import type { DocumentState, LoadedDocumentState, LoadedTextProjectionSnapshot } from './editor-document-state'
import type { DocumentKind, DocumentModel } from '~/domain/document/document-model'
import type { SceneSelectionState } from '~/domain/document/scene-selection'
import type { EngineRuntimeCapabilities } from '~/domain/engine/runtime-capabilities'
import type { AbsPath } from '~/domain/path'
import type { PreviewMediaSession } from '~/features/editor/preview/preview-media-session'
import type { ScenePresentationState } from '~/features/editor/shared/scene-presentation'

export interface CoreEditorState {
  path: AbsPath
}

export interface EditableProjectionBase extends CoreEditorState {
  isDirty: boolean
  lastSavedTime?: Date
  kind: DocumentKind
}

export interface TextProjectionState extends EditableProjectionBase {
  projection: 'text'
  runtimeCapabilities?: EngineRuntimeCapabilities
  textContent: string
  textSource: 'projection' | 'draft'
  syncError?: 'invalid-animation-json'
}

export interface SceneVisualProjectionState extends EditableProjectionBase {
  projection: 'visual'
  kind: 'scene'
  runtimeCapabilities: EngineRuntimeCapabilities
  statements: StatementEntry[]
}

export interface AnimationFramesVisualProjectionState extends EditableProjectionBase {
  projection: 'visual'
  kind: 'animation'
  format: 'v1-frames'
  frames: AnimationFrame[]
}

/** v2 文档可以进入可视投影，但帧编辑器不可用；这里不携带帧，避免把空帧当成可编辑模型 */
export interface AnimationObjectVisualProjectionState extends EditableProjectionBase {
  projection: 'visual'
  kind: 'animation'
  format: 'v2-object'
}

export type AnimationVisualProjectionState =
  | AnimationFramesVisualProjectionState
  | AnimationObjectVisualProjectionState

export type VisualProjectionState = SceneVisualProjectionState | AnimationVisualProjectionState

export type EditableEditorState = TextProjectionState | VisualProjectionState

export interface AssetPreviewState extends CoreEditorState {
  view: 'preview'
  assetUrl: string
  mimeType: string
  fileSize?: number
}

export interface UnsupportedState extends CoreEditorState {
  view: 'unsupported'
}

export type EditorState = EditableEditorState | AssetPreviewState | UnsupportedState

export interface EditableEditorSession {
  type: 'editable'
  activeProjection: 'text' | 'visual'
  document: DocumentState
  textState: TextProjectionState
  visualState?: VisualProjectionState
  scenePresentation?: ScenePresentationState
  sceneSelection?: SceneSelectionState
  pendingSceneProjectionActivation?: SceneProjectionActivation
}

export interface AssetPreviewSession {
  type: 'preview'
  state: AssetPreviewState
  previewMediaSession?: PreviewMediaSession
}

export interface UnsupportedEditorSession {
  type: 'unsupported'
  state: UnsupportedState
}

export type EditorSession =
  | EditableEditorSession
  | AssetPreviewSession
  | UnsupportedEditorSession

export type SceneProjectionActivation = 'text' | 'visual'

type InitialVisualProjectionState =
  | Pick<SceneVisualProjectionState, 'kind' | 'runtimeCapabilities' | 'statements'>
  | Pick<AnimationFramesVisualProjectionState, 'kind' | 'format' | 'frames'>
  | Pick<AnimationObjectVisualProjectionState, 'kind' | 'format'>

export function isEditableEditor(state: EditorState): state is EditableEditorState {
  return 'projection' in state
}

export function isSceneVisualProjection(state: EditorState): state is SceneVisualProjectionState {
  return isEditableEditor(state) && state.projection === 'visual' && state.kind === 'scene'
}

export function isAnimationVisualProjection(state: EditorState): state is AnimationVisualProjectionState {
  return isEditableEditor(state) && state.projection === 'visual' && state.kind === 'animation'
}

export function createEditableSession(
  path: AbsPath,
  loadedState: LoadedDocumentState,
  preferredProjection: 'text' | 'visual',
): EditableEditorSession {
  const { model } = loadedState
  const visualStateSnapshot = model.kind === 'scene' || model.kind === 'animation'
    ? createInitialVisualProjectionState(model)
    : undefined
  const activeProjection = resolveActiveProjection(
    preferredProjection,
    visualStateSnapshot !== undefined,
  )
  const initialTextProjection = resolveLoadedTextProjectionSnapshot(loadedState, activeProjection)
  const textState = reactive({
    path,
    isDirty: false,
    projection: 'text',
    kind: model.kind,
    runtimeCapabilities: model.kind === 'scene' ? model.runtimeCapabilities : undefined,
    textContent: initialTextProjection.content,
    textSource: initialTextProjection.source,
    syncError: initialTextProjection.syncError,
  }) as TextProjectionState

  const visualState = visualStateSnapshot
    ? reactive({
      path,
      isDirty: false,
      projection: 'visual',
      ...visualStateSnapshot,
    }) as VisualProjectionState
    : undefined

  return shallowReactive({
    type: 'editable',
    activeProjection,
    document: createDocumentState(model, loadedState.savedTextContent),
    textState,
    visualState,
    scenePresentation: model.kind === 'scene'
      ? reactive(createScenePresentationState()) as ScenePresentationState
      : undefined,
    sceneSelection: model.kind === 'scene'
      ? reactive({}) as SceneSelectionState
      : undefined,
  }) as EditableEditorSession
}

export function applyLoadedDocumentState(
  session: EditableEditorSession,
  loadedState: LoadedDocumentState,
  preferredProjection: 'text' | 'visual',
): void {
  session.document.model = loadedState.model
  session.document.savedTextContent = loadedState.savedTextContent
  invalidateDocumentTextCache(session.document)
  const activeProjection = resolveActiveProjection(
    preferredProjection,
    session.visualState !== undefined,
  )
  session.activeProjection = activeProjection
  applyLoadedTextProjectionSnapshot(
    session.textState,
    loadedState.model,
    resolveLoadedTextProjectionSnapshot(loadedState, activeProjection),
  )
  // 外部重载替换了整个文档基线：投影不继承旧会话的脏状态，文本快照也必须重新对齐新模型。
  session.textState.isDirty = false
  syncAnimationTextProjection(session.textState, session.document)
  if (session.visualState) {
    session.visualState.isDirty = false
    if (session.visualState.kind === 'scene' && loadedState.model.kind === 'scene') {
      session.visualState.runtimeCapabilities = loadedState.model.runtimeCapabilities
    }
  }
}

/**
 * 动画文档的写入源：可视投影激活时以文档模型为准，文本投影只是同一份内容的快照。
 * 快照没跟上模型时保存会把旧 JSON 当成「用户文本改动」写回磁盘，覆盖可视编辑的结果，
 * 因此每次进入可视投影都要调用它。
 *
 * 非法 JSON 的草稿（syncError）是用户唯一的修复入口，必须原样保留。
 */
export function syncAnimationTextProjection(
  textState: TextProjectionState,
  document: DocumentState,
): void {
  if (document.model.kind === 'animation' && textState.syncError === undefined) {
    textState.textContent = getDocumentTextContent(document)
    textState.textSource = 'projection'
  }
}

export function syncProjectionStateFromDocument(session: EditableEditorSession): void {
  const { document, textState } = session
  syncDocumentHistoryState(document)

  const nextContent = getDocumentTextContent(document)
  if (
    textState.textSource === 'projection'
    && textState.syncError === undefined
    && textState.textContent !== nextContent
  ) {
    textState.textContent = nextContent
  }

  textState.isDirty = isTextProjectionDirty(document, textState)
  textState.runtimeCapabilities = document.model.kind === 'scene'
    ? document.model.runtimeCapabilities
    : undefined

  // 文本编辑或外部重载可能改变动画文档格式；可视状态必须先跟上当前模型再同步
  reconcileAnimationVisualProjectionState(session)
  const visualState = session.visualState
  if (!visualState) {
    return
  }

  visualState.isDirty = isDocumentDirty(document)

  if (visualState.kind === 'scene' && document.model.kind === 'scene') {
    visualState.runtimeCapabilities = document.model.runtimeCapabilities
    visualState.statements = projectSceneStatements(document.model, visualState.statements)
  }

  if (
    visualState.kind === 'animation'
    && visualState.format === 'v1-frames'
    && document.model.kind === 'animation'
    && document.model.format === 'v1-frames'
  ) {
    visualState.frames = projectAnimationFrames(document.model, visualState.frames)
  }
}

/** 文本编辑或外部重载可能改变动画文档格式：可视化投影必须跟随，避免用旧的帧模型操作新文档 */
function reconcileAnimationVisualProjectionState(session: EditableEditorSession): void {
  const model = session.document.model
  if (model.kind !== 'animation') {
    return
  }

  if (session.visualState?.kind === 'animation' && session.visualState.format === model.format) {
    return
  }

  const lastSavedTime = session.visualState?.lastSavedTime
  session.visualState = reactive({
    path: session.textState.path,
    isDirty: false,
    projection: 'visual',
    ...createInitialVisualProjectionState(model),
  }) as VisualProjectionState
  session.visualState.lastSavedTime = lastSavedTime
}

export function getTextProjectionPersistedContent(
  document: DocumentState,
  textState: TextProjectionState,
): string {
  return textState.textSource === 'draft'
    ? textState.textContent
    : getDocumentTextContent(document)
}

export function isTextProjectionDirty(
  document: DocumentState,
  textState: TextProjectionState,
): boolean {
  return isDocumentDirty(document)
    || (textState.textSource === 'draft' && textState.textContent !== document.savedTextContent)
}

function createInitialVisualProjectionState(
  model: Extract<DocumentModel, { kind: 'scene' | 'animation' }>,
): InitialVisualProjectionState {
  if (model.kind === 'scene') {
    return {
      kind: 'scene',
      runtimeCapabilities: model.runtimeCapabilities,
      statements: projectSceneStatements(model),
    }
  }

  if (model.format === 'v2-object') {
    return {
      kind: 'animation',
      format: 'v2-object',
    }
  }

  return {
    kind: 'animation',
    format: 'v1-frames',
    frames: projectAnimationFrames(model),
  }
}

function resolveActiveProjection(
  preferredProjection: 'text' | 'visual',
  hasVisualProjection: boolean,
): 'text' | 'visual' {
  return preferredProjection === 'visual'
    && hasVisualProjection
    ? 'visual'
    : 'text'
}

function resolveLoadedTextProjectionSnapshot(
  loadedState: LoadedDocumentState,
  activeProjection: 'text' | 'visual',
): LoadedTextProjectionSnapshot {
  if (
    loadedState.textProjection
    && (
      activeProjection === 'text'
      || loadedState.textProjection.syncError !== undefined
    )
  ) {
    return loadedState.textProjection
  }

  return {
    content: serializeDocument(loadedState.model),
    source: 'projection',
    syncError: undefined,
  }
}

function applyLoadedTextProjectionSnapshot(
  textState: TextProjectionState,
  model: DocumentModel,
  snapshot: LoadedTextProjectionSnapshot,
): void {
  textState.kind = model.kind
  textState.runtimeCapabilities = model.kind === 'scene'
    ? model.runtimeCapabilities
    : undefined
  textState.textContent = snapshot.content
  textState.textSource = snapshot.source
  textState.syncError = snapshot.syncError
}
