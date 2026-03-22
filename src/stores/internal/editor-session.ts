import { createScenePresentationState } from '~/helper/scene-presentation'
import { StatementEntry } from '~/helper/webgal-script/sentence'
import { serializeDocument } from '~/models/serializer'
import { projectAnimationFrames, projectSceneStatements } from '~/models/visual-projection'
import { AnimationFrame } from '~/types/stage'

import {
  createDocumentState,
  getDocumentTextContent,
  invalidateDocumentTextCache,
  isDocumentDirty,
  syncDocumentHistoryState,
} from './editor-document-state'

import type { DocumentState, LoadedDocumentState, LoadedTextProjectionSnapshot } from './editor-document-state'
import type { PreviewMediaSession } from '~/helper/preview-media-session'
import type { ScenePresentationState } from '~/helper/scene-presentation'
import type { DocumentKind, DocumentModel } from '~/models/document-model'
import type { SceneSelectionState } from '~/models/scene-selection'

export interface CoreEditorState {
  path: string
}

export interface EditableProjectionBase extends CoreEditorState {
  isDirty: boolean
  lastSavedTime?: Date
  kind: DocumentKind
}

export interface TextProjectionState extends EditableProjectionBase {
  projection: 'text'
  textContent: string
  textSource: 'projection' | 'draft'
  syncError?: 'invalid-animation-json'
}

export interface SceneVisualProjectionState extends EditableProjectionBase {
  projection: 'visual'
  kind: 'scene'
  statements: StatementEntry[]
}

export interface AnimationVisualProjectionState extends EditableProjectionBase {
  projection: 'visual'
  kind: 'animation'
  frames: AnimationFrame[]
}

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

type InitialVisualProjectionState =
  Pick<SceneVisualProjectionState, 'kind' | 'statements'>
  | Pick<AnimationVisualProjectionState, 'kind' | 'frames'>

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
  path: string,
  loadedState: LoadedDocumentState,
  preferredProjection: 'text' | 'visual',
): EditableEditorSession {
  const model = loadedState.model
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
    loadedState.model.kind,
    resolveLoadedTextProjectionSnapshot(loadedState, activeProjection),
  )
  // 外部重载会替换整个文档基线，投影不应继承旧会话中的脏状态。
  session.textState.isDirty = false
  if (session.visualState) {
    session.visualState.isDirty = false
  }
}

export function normalizeAnimationTextProjection(
  textState: TextProjectionState,
  document: DocumentState,
): void {
  if (document.model.kind !== 'animation') {
    return
  }

  textState.textContent = getDocumentTextContent(document)
  textState.textSource = 'projection'
  textState.syncError = undefined
}

export function syncProjectionStateFromDocument(
  document: DocumentState,
  textState?: TextProjectionState,
  visualState?: VisualProjectionState,
): void {
  syncDocumentHistoryState(document)

  if (textState) {
    const nextContent = getDocumentTextContent(document)
    if (
      textState.textSource === 'projection'
      && textState.syncError === undefined
      && textState.textContent !== nextContent
    ) {
      textState.textContent = nextContent
    }

    textState.isDirty = isTextProjectionDirty(document, textState)
  }

  if (!visualState) {
    return
  }

  visualState.isDirty = isDocumentDirty(document)

  if (visualState.kind === 'scene' && document.model.kind === 'scene') {
    visualState.statements = projectSceneStatements(document.model, visualState.statements)
  }

  if (visualState.kind === 'animation' && document.model.kind === 'animation') {
    visualState.frames = projectAnimationFrames(document.model, visualState.frames)
  }
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
      statements: projectSceneStatements(model),
    }
  }

  return {
    kind: 'animation',
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
  kind: DocumentKind,
  snapshot: LoadedTextProjectionSnapshot,
): void {
  textState.kind = kind
  textState.textContent = snapshot.content
  textState.textSource = snapshot.source
  textState.syncError = snapshot.syncError
}
