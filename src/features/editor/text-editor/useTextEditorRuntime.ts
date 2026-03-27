import * as monaco from 'monaco-editor'

import { isAnimationDocumentTextValid } from '~/domain/document/animation-document-codec'
import { resolveTextEditorLanguage } from '~/features/editor/text-editor/text-editor-language'
import { applySceneCursorTarget, prepareSceneCursorTarget } from '~/features/editor/text-editor/text-editor-scene-restore'
import { resolveSceneCursorTarget, resolveScenePreviewLine } from '~/features/editor/text-editor/text-editor-scene-sync'
import { isEditableEditor, useEditorStore } from '~/stores/editor'
import { useTabsStore } from '~/stores/tabs'

import { useTextEditorBindings } from './useTextEditorBindings'
import { useTextEditorContentSync } from './useTextEditorContentSync'
import { useTextEditorHistory } from './useTextEditorHistory'
import { useTextEditorPanel } from './useTextEditorPanel'
import { useTextEditorWorkspace } from './useTextEditorWorkspace'

import type { TextProjectionState } from '~/stores/editor'

interface UseTextEditorRuntimeOptions {
  editorRef: ShallowRef<monaco.editor.IStandaloneCodeEditor | undefined>
  getState: () => TextProjectionState
}

export function useTextEditorRuntime(options: UseTextEditorRuntimeOptions) {
  const editorStore = useEditorStore()
  const tabsStore = useTabsStore()

  const state = computed(() => options.getState())
  const activeProjection = computed(() => {
    const currentState = editorStore.currentState
    return currentState && isEditableEditor(currentState) ? currentState.projection : undefined
  })
  let isComposing = $ref(false)

  function readEditor(): monaco.editor.IStandaloneCodeEditor | undefined {
    return options.editorRef.value
  }

  function syncViewStateForSave(path: string) {
    textEditorWorkspace.saveViewState(path, { persistSessionRecovery: true })
  }

  let syncedModelPath = $ref<string>()

  function focusEditor() {
    if (!readEditor()) {
      return
    }

    nextTick(() => {
      setTimeout(() => {
        readEditor()?.focus()
      }, 50)
    })
  }

  function isCurrentTabPreview(): boolean {
    return tabsStore.activeTab?.isPreview === true
  }

  function isCurrentTextProjectionActive(): boolean {
    return activeProjection.value === 'text' && tabsStore.activeTab?.path === state.value.path
  }

  function readSceneSelection() {
    return editorStore.getSceneSelection(state.value.path)
  }

  function syncSceneSelection(lineNumber: number | undefined) {
    const currentState = state.value
    if (currentState.kind !== 'scene' || !isCurrentTextProjectionActive()) {
      return
    }

    editorStore.syncSceneSelectionFromTextLine(currentState.path, lineNumber)
  }

  function handleCompositionStart() {
    isComposing = true
  }

  function handleCompositionEnd() {
    if (!isComposing) {
      return
    }

    isComposing = false
    contentSync.handleCompositionEnd()
  }

  const textEditorHistory = useTextEditorHistory({
    editorRef: options.editorRef,
    getState: () => state.value,
    isComposing: () => isComposing,
    handleCompositionEnd,
    handleCompositionStart,
    undoDocument: path => editorStore.undoDocument(path),
    redoDocument: path => editorStore.redoDocument(path),
    syncAnimationTextContentFromEditor(path, content) {
      if (!isAnimationDocumentTextValid(content)) {
        editorStore.setTextProjectionDraft(path, content, 'invalid-animation-json')
        editorStore.scheduleAutoSaveIfEnabled(path)
        return
      }

      editorStore.replaceTextDocumentContent(path, content, {
        preserveDraftText: true,
        source: 'text',
      })
      editorStore.scheduleAutoSaveIfEnabled(path)
    },
    scheduleAutoSaveIfEnabled: path => editorStore.scheduleAutoSaveIfEnabled(path),
    syncSceneSelection,
  })

  function initializeSceneSelectionFromRestoredCursor() {
    const editor = readEditor()
    const currentState = state.value
    if (currentState.kind !== 'scene' || !editor) {
      return
    }

    const cursorLine = editor.getPosition()?.lineNumber
    const selection = readSceneSelection()
    if (cursorLine && (!selection?.lastLineNumber || selection.selectedStatementId === undefined)) {
      editorStore.syncSceneSelectionFromTextLine(currentState.path, cursorLine)
    }
  }

  const textEditorWorkspace = useTextEditorWorkspace({
    editorRef: options.editorRef,
    focusEditor,
    initializeSceneSelectionFromRestoredCursor,
    isCurrentTabPreview,
    shouldPersistPersistentViewState(path) {
      const currentState = editorStore.getState(path)
      return !(currentState && isEditableEditor(currentState) && currentState.isDirty)
    },
  })

  const formPanel = useTextEditorPanel({
    captureBeforeContentChange: textEditorHistory.captureBeforeContentChange,
    editorRef: options.editorRef,
    getPath: () => state.value.path,
  })

  const textEditorBindings = useTextEditorBindings({
    editorRef: options.editorRef,
    getState: () => state.value,
    formPanel,
    isCurrentTextProjectionActive,
    textEditorHistory,
  })

  const currentEditorLanguage = computed((): string =>
    resolveTextEditorLanguage(state.value, monaco.languages.getLanguages()),
  )

  function syncScene() {
    const editor = readEditor()
    const currentState = state.value
    if (currentState.isDirty || currentState.kind !== 'scene' || !editor) {
      return
    }

    const model = editor.getModel()
    if (!model) {
      return
    }

    const positionLineNumber = editor.getPosition()?.lineNumber
    const previewLine = resolveScenePreviewLine(positionLineNumber, model)
    if (!previewLine) {
      return
    }

    editorStore.syncScenePreview(currentState.path, previewLine.lineNumber, previewLine.lineText)
  }

  function readSceneLineNumber(): number | undefined {
    return readSceneSelection()?.lastLineNumber
  }

  function readSelectedSceneStatementId(): number | undefined {
    return readSceneSelection()?.selectedStatementId
  }

  function scheduleAutoSaveIfEnabled(): void {
    editorStore.scheduleAutoSaveIfEnabled(state.value.path)
  }

  const debouncedSaveViewState = useDebounceFn(() => {
    textEditorWorkspace.saveViewState(state.value.path)
  }, 300)

  function handleCursorPositionChange(event: monaco.editor.ICursorPositionChangedEvent) {
    textEditorHistory.rememberCurrentCursorSnapshot()

    const { reason, position } = event
    if (
      reason === monaco.editor.CursorChangeReason.NotSet
      || reason === monaco.editor.CursorChangeReason.ContentFlush
    ) {
      return
    }

    debouncedSaveViewState()

    if (readSceneLineNumber() === position.lineNumber && readSelectedSceneStatementId() !== undefined) {
      return
    }

    syncSceneSelection(position.lineNumber)
    syncScene()
  }

  function handleScrollChange() {
    debouncedSaveViewState()
  }

  function handleCursorSelectionChange() {
    textEditorHistory.rememberCurrentCursorSnapshot()
  }

  function handleContentChange(event: monaco.editor.IModelContentChangedEvent) {
    contentSync.handleContentChange(event)

    if (!event.isFlush) {
      textEditorWorkspace.saveViewState(state.value.path)
    }
  }

  function handleEditorClick() {
    textEditorWorkspace.markFileInteracted(state.value.path)
  }

  function applyLastLineNumber() {
    const editor = readEditor()
    const lineNumber = readSceneLineNumber()
    if (!editor || !lineNumber) {
      return
    }

    const model = editor.getModel()
    if (!model) {
      return
    }

    const cursorTarget = resolveSceneCursorTarget(lineNumber, model, editor.getPosition() ?? undefined)
    if (!cursorTarget) {
      return
    }

    applySceneCursorTarget(
      editor,
      cursorTarget,
      monaco.editor.ScrollType.Immediate,
    )
  }

  function scheduleApplyLastLineNumber(afterApply?: () => void) {
    nextTick(() => {
      requestAnimationFrame(() => {
        applyLastLineNumber()
        afterApply?.()
      })
    })
  }

  function syncTextCursorFromSceneSelection(options: {
    persistViewState?: boolean
    syncPreview?: boolean
  } = {}) {
    if (state.value.kind !== 'scene') {
      return
    }

    const editor = readEditor()
    const model = editor?.getModel()
    const lineNumber = readSceneLineNumber()
    if (editor && model && lineNumber) {
      const cursorTarget = resolveSceneCursorTarget(lineNumber, model, editor.getPosition() ?? undefined)
      if (cursorTarget) {
        prepareSceneCursorTarget(editor, cursorTarget)
      }
    }

    scheduleApplyLastLineNumber(() => {
      if (options.persistViewState) {
        textEditorWorkspace.saveViewState(state.value.path)
      }
      if (options.syncPreview) {
        syncScene()
      }
    })
  }

  const contentSync = useTextEditorContentSync({
    consumePendingTextTransactionSource: textEditorBindings.consumePendingTextTransactionSource,
    editorRef: options.editorRef,
    getState: () => state.value,
    isComposing: () => isComposing,
    scheduleAutoSaveIfEnabled,
    syncSceneSelection,
    textEditorHistory,
  })

  function switchModel(newPath: string, oldPath: string) {
    textEditorWorkspace.switchModel({
      language: currentEditorLanguage.value,
      newPath,
      oldPath,
      value: state.value.textContent,
    })
    syncedModelPath = newPath

    nextTick(() => {
      syncScene()
    })
  }

  function syncEditorModelToState() {
    const editor = readEditor()
    if (!editor) {
      return
    }

    if (!syncedModelPath || syncedModelPath === state.value.path) {
      return
    }

    switchModel(state.value.path, syncedModelPath)
  }

  function handleEditorCreated() {
    textEditorHistory.installHistoryHandling()
    syncedModelPath = state.value.path
    textEditorWorkspace.restoreViewState(state.value.path, { isCreating: true })
    textEditorWorkspace.markFileOpened(state.value.path)
    textEditorWorkspace.markEditorCreated()
  }

  function handleBeforeUnmount() {
    textEditorWorkspace.saveViewState(state.value.path)
  }

  function ensureModel() {
    return textEditorWorkspace.ensureModel(
      state.value.textContent,
      currentEditorLanguage.value,
      state.value.path,
    )
  }

  watch(() => state.value.path, (newPath, oldPath) => {
    if (oldPath && oldPath !== newPath) {
      editorStore.unregisterSaveHook(oldPath, syncViewStateForSave)
    }
    editorStore.registerSaveHook(newPath, syncViewStateForSave)

    if (oldPath && newPath !== oldPath && isCurrentTextProjectionActive()) {
      switchModel(newPath, oldPath)
    }
  }, { immediate: true })

  tryOnUnmounted(() => {
    editorStore.unregisterSaveHook(state.value.path, syncViewStateForSave)
  })

  watch(() => currentEditorLanguage.value, (language) => {
    textEditorWorkspace.syncCurrentModelLanguage(language)
  })

  watch(
    [
      () => activeProjection.value,
      () => tabsStore.shouldFocusEditor,
      () => tabsStore.activeTab?.path,
    ],
    ([projection, shouldFocus, activePath], [previousProjection]) => {
      if (projection === 'text' && shouldFocus && activePath === state.value.path && readEditor()) {
        syncEditorModelToState()
        textEditorWorkspace.restoreViewState(state.value.path)
      }

      if (
        projection === 'text'
        && previousProjection === 'visual'
        && activePath === state.value.path
        && state.value.kind === 'scene'
      ) {
        syncEditorModelToState()
        syncTextCursorFromSceneSelection({
          syncPreview: true,
        })
      }
    },
  )

  return {
    currentEditorLanguage,
    ensureModel,
    handleBeforeUnmount,
    handleContentChange,
    handleCursorPositionChange,
    handleCursorSelectionChange,
    handleEditorClick,
    handleEditorCreated,
    handleScrollChange,
  }
}
