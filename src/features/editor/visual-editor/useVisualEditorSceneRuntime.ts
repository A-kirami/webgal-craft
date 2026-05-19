import { computeLineNumberFromStatementId, computeStatementIdFromLineNumber } from '~/domain/document/scene-selection'
import { buildStatements, StatementEntry } from '~/domain/script/sentence'
import { useCommandPanelBridgeBinding, useSidebarPanelBinding } from '~/features/editor/shared/useEditorPanelBindings'
import { useShortcut } from '~/features/editor/shortcut/useShortcut'
import { createStatementIdTarget, StatementUpdatePayload } from '~/features/editor/statement-editor/useStatementEditor'
import { useVisualEditorSceneViewport } from '~/features/editor/visual-editor/useVisualEditorSceneViewport'
import { resolveVisualEditorDropAction } from '~/features/editor/visual-editor/visual-editor-file-drop'
import { canRestoreVisualEditorCardFocus, findSelectedVisualEditorStatementCard } from '~/features/editor/visual-editor/visual-editor-focus'
import { useCommandPanelStore } from '~/stores/command-panel'
import { useEditSettingsStore } from '~/stores/edit-settings'
import { isEditableEditor, SceneVisualProjectionState, useEditorStore } from '~/stores/editor'
import { useEditorViewStateStore } from '~/stores/editor-view-state'
import { usePreferenceStore } from '~/stores/preference'
import { useTabsStore } from '~/stores/tabs'
import { useWorkspaceStore } from '~/stores/workspace'
import { buildPreviousSpeakers } from '~/utils/speaker'

import type { VisualEditorDropPlacement } from '~/features/editor/visual-editor/visual-editor-file-drop'
import type { FileSystemDragPayload } from '~/types/drag-drop'

export interface VisualEditorFileDropTarget {
  insertIndex: number
  placement: VisualEditorDropPlacement
  statementId?: number
}

interface UseVisualEditorSceneRuntimeOptions {
  getScrollArea: () => InstanceType<typeof ScrollArea> | null | undefined
  getState: () => SceneVisualProjectionState
}

interface StatementReorderOptions {
  restoreSelectionPresentation?: boolean
}

export function useVisualEditorSceneRuntime(options: UseVisualEditorSceneRuntimeOptions) {
  const editorStore = useEditorStore()
  const editorViewStateStore = useEditorViewStateStore()
  const tabsStore = useTabsStore()
  const editSettings = useEditSettingsStore()
  const preferenceStore = usePreferenceStore()
  const commandPanelStore = useCommandPanelStore()
  const workspaceStore = useWorkspaceStore()

  let statementClipboard: string | undefined
  const state = computed(() => options.getState())
  const activeProjection = computed(() => {
    const currentState = editorStore.currentState
    return currentState && isEditableEditor(currentState) ? currentState.projection : undefined
  })

  function requestAutoSave(): void {
    editorStore.scheduleAutoSaveIfEnabled(state.value.path)
  }

  function syncStatementPreview(statementId: number | undefined, force: boolean = false): void {
    if (statementId === undefined || state.value.isDirty) {
      return
    }

    const entry = state.value.statements.find(statement => statement.id === statementId)
    if (!entry) {
      return
    }

    const lineNumber = resolveStatementLineNumber(statementId)
    if (lineNumber === undefined) {
      return
    }

    if (force) {
      editorStore.syncScenePreview(state.value.path, lineNumber, entry.rawText, true)
      return
    }

    editorStore.syncScenePreview(state.value.path, lineNumber, entry.rawText)
  }

  function isCurrentVisualProjectionActive(): boolean {
    return activeProjection.value === 'visual' && tabsStore.activeTab?.path === state.value.path
  }

  function readSceneSelection() {
    return editorStore.getSceneSelection(state.value.path)
  }

  function readSelectedStatementId(): number | undefined {
    return readSceneSelection()?.selectedStatementId
  }

  function readSelectedLineNumber(): number | undefined {
    return readSceneSelection()?.lastLineNumber
  }

  function readStatementIndex(statementId: number | undefined): number {
    if (statementId === undefined) {
      return -1
    }

    return state.value.statements.findIndex(entry => entry.id === statementId)
  }

  function readSelectedStatement(): StatementEntry | undefined {
    const currentSelectedStatementId = readSelectedStatementId()
    if (currentSelectedStatementId === undefined) {
      return undefined
    }

    return state.value.statements.find(statement => statement.id === currentSelectedStatementId)
  }

  function resolveStatementLineNumber(statementId: number | undefined): number | undefined {
    if (statementId === undefined) {
      return undefined
    }

    return computeLineNumberFromStatementId(state.value.statements, statementId)
  }

  function resolveInsertIndexAfterSelection(): number {
    const selectedIndex = readStatementIndex(readSelectedStatementId())
    return selectedIndex === -1 ? state.value.statements.length : selectedIndex + 1
  }

  function readSelectedPreviousSpeaker(): string {
    if (selectedIndex.value <= 0) {
      return ''
    }

    return previousSpeakers.value[selectedIndex.value] ?? ''
  }

  function syncSceneSelectionFromStatement(
    statementId: number | undefined,
    options_: {
      lastEditedStatementId?: number | undefined
      lineNumber?: number | undefined
    } = {},
  ) {
    const lineNumber = options_.lineNumber ?? resolveStatementLineNumber(statementId)
    editorStore.syncSceneSelectionFromStatement(state.value.path, statementId, {
      ...options_,
      lineNumber,
    })
    if (lineNumber !== undefined) {
      editorViewStateStore.updatePrimaryCursorLine(state.value.path, lineNumber)
    }
  }

  const selectedStatementId = computed(() => readSelectedStatementId())
  const selectedIndex = computed(() => readStatementIndex(readSelectedStatementId()))

  function autoSelectFromLineNumber() {
    if (state.value.statements.length === 0) {
      return
    }

    let lineNumber = readSelectedLineNumber()
    if (!lineNumber) {
      const recoveredViewState = editorViewStateStore.consumeSessionRecoveryViewState(state.value.path)
        ?? editorViewStateStore.getPersistentViewState(state.value.path)
      lineNumber = recoveredViewState?.cursorState[0]?.position.lineNumber
    }

    if (lineNumber) {
      const statementId = computeStatementIdFromLineNumber(state.value.statements, lineNumber)
      if (statementId !== undefined) {
        syncSceneSelectionFromStatement(statementId, { lineNumber })
        return
      }
    }

    syncSceneSelectionFromStatement(state.value.statements[0].id)
  }

  function ensureSelectedStatementPresent() {
    if (selectedStatementId.value !== undefined && selectedIndex.value !== -1) {
      return
    }

    autoSelectFromLineNumber()
  }

  function focusSelectedStatementCard() {
    const viewportElement = options.getScrollArea()?.viewport?.viewportElement
    if (!viewportElement) {
      return
    }

    const selectedCard = findSelectedVisualEditorStatementCard(viewportElement)
    if (selectedCard instanceof HTMLElement) {
      selectedCard.focus()
    }
  }

  async function restoreSelectedStatementPresentation(
    options_: {
      align?: 'center' | 'auto'
      focus?: boolean
    } = {},
  ) {
    ensureSelectedStatementPresent()
    await nextTick()
    await viewport.scrollToSelectedStatement(options_.align ?? 'center')

    if (options_.focus && canRestoreVisualEditorCardFocus(document.activeElement)) {
      await nextTick()
      focusSelectedStatementCard()
    }
  }

  function performUndo() {
    if (!editorStore.undoDocument(state.value.path).applied) {
      return
    }

    void restoreSelectedStatementPresentation({
      align: 'auto',
      focus: true,
    })
    requestAutoSave()
  }

  function performRedo() {
    if (!editorStore.redoDocument(state.value.path).applied) {
      return
    }

    void restoreSelectedStatementPresentation({
      align: 'auto',
      focus: true,
    })
    requestAutoSave()
  }

  function copyStatement() {
    const entry = readSelectedStatement()
    if (entry) {
      statementClipboard = entry.rawText
    }
  }

  function duplicateSelectedStatement() {
    const entry = readSelectedStatement()
    if (!entry) {
      return
    }

    const duplicatedStatement = buildStatements(entry.rawText)[0]
    if (!duplicatedStatement) {
      return
    }

    editorStore.applySceneStatementInsert(
      state.value.path,
      [duplicatedStatement],
      resolveInsertIndexAfterSelection(),
    )

    void restoreSelectedStatementPresentation({
      align: 'auto',
      focus: true,
    })
    requestAutoSave()
  }

  function reorderStatements(fromIndex: number, toIndex: number, reorderOptions: StatementReorderOptions = {}) {
    const statementCount = state.value.statements.length
    if (statementCount === 0 || fromIndex < 0 || fromIndex >= statementCount) {
      return
    }

    const normalizedTargetIndex = Math.min(Math.max(toIndex, 0), statementCount - 1)
    if (fromIndex === normalizedTargetIndex) {
      return
    }

    editorStore.applySceneStatementReorder(state.value.path, fromIndex, normalizedTargetIndex)
    if (reorderOptions.restoreSelectionPresentation ?? true) {
      void restoreSelectedStatementPresentation({
        align: 'auto',
        focus: true,
      })
    }
    requestAutoSave()
  }

  function moveSelectedStatement(offset: -1 | 1) {
    const currentSelectedStatementId = readSelectedStatementId()
    const currentSelectedIndex = selectedIndex.value
    if (currentSelectedStatementId === undefined || currentSelectedIndex === -1) {
      return
    }

    const nextIndex = currentSelectedIndex + offset
    if (nextIndex < 0 || nextIndex >= state.value.statements.length) {
      return
    }

    reorderStatements(currentSelectedIndex, nextIndex)
  }

  function handleStatementDelete(id: number) {
    if (!state.value.statements.some(entry => entry.id === id)) {
      return
    }

    editorStore.applySceneStatementDelete(state.value.path, id)

    void restoreSelectedStatementPresentation({
      align: 'auto',
      focus: true,
    })
    requestAutoSave()
  }

  function resolveFileDropAction(payload: FileSystemDragPayload, target: VisualEditorFileDropTarget) {
    const gamePath = workspaceStore.currentGame?.path
    if (!gamePath) {
      return
    }

    const statementEntry = target.statementId === undefined
      ? undefined
      : state.value.statements.find(entry => entry.id === target.statementId)

    return resolveVisualEditorDropAction({
      gamePath,
      payload,
      placement: target.placement,
      insertIndex: target.insertIndex,
      rawText: statementEntry?.rawText,
      statementId: target.statementId,
    })
  }

  function canHandleFileDrop(payload: FileSystemDragPayload, target: VisualEditorFileDropTarget): boolean {
    return resolveFileDropAction(payload, target) !== undefined
  }

  function handleFileDrop(payload: FileSystemDragPayload, target: VisualEditorFileDropTarget): boolean {
    const action = resolveFileDropAction(payload, target)
    if (!action) {
      return false
    }

    if (action.kind === 'insert-statements') {
      const newEntries = action.rawTexts.flatMap(text => buildStatements(text))
      if (newEntries.length === 0) {
        return false
      }

      editorStore.applySceneStatementInsert(state.value.path, newEntries, action.insertIndex)
      void restoreSelectedStatementPresentation({ align: 'auto' })
      requestAutoSave()
      return true
    }

    editorStore.applySceneStatementUpdate(
      state.value.path,
      action.statementId,
      action.rawText,
      'visual',
    )
    requestAutoSave()
    return true
  }

  function cutStatement() {
    const currentSelectedStatementId = readSelectedStatementId()
    if (currentSelectedStatementId === undefined) {
      return
    }

    copyStatement()
    handleStatementDelete(currentSelectedStatementId)
  }

  function pasteStatement() {
    if (!statementClipboard) {
      return
    }

    const newEntry = buildStatements(statementClipboard)[0]
    const insertAt = resolveInsertIndexAfterSelection()
    editorStore.applySceneStatementInsert(state.value.path, [newEntry], insertAt)
    void restoreSelectedStatementPresentation({
      align: 'auto',
      focus: true,
    })
    requestAutoSave()
  }

  const previousSpeakers = computed(() => buildPreviousSpeakers(state.value.statements))
  const viewport = useVisualEditorSceneViewport({
    getScrollArea: options.getScrollArea,
    getSelectedIndex: () => selectedIndex.value,
    getState: () => state.value,
    restoreSelection: autoSelectFromLineNumber,
  })

  useSidebarPanelBinding({
    enableFocusStatement: true,
    handleRedo: performRedo,
    handleUndo: performUndo,
    isActive: isCurrentVisualProjectionActive,
    getEntry: readSelectedStatement,
    getUpdateTarget: () => {
      const currentSelectedStatementId = readSelectedStatementId()
      if (currentSelectedStatementId === undefined) {
        return
      }
      return createStatementIdTarget(currentSelectedStatementId)
    },
    getIndex: () => selectedIndex.value === -1 ? undefined : selectedIndex.value,
    getPreviousSpeaker: readSelectedPreviousSpeaker,
    onUpdate: handleStatementUpdate,
    onFocusStatement() {
      void restoreSelectedStatementPresentation({ focus: true })
    },
  })

  function insertRawTexts(rawTexts: string[]) {
    if (rawTexts.length === 0) {
      return
    }

    const newEntries = rawTexts.flatMap(text => buildStatements(text))
    const insertAt = editSettings.commandInsertPosition === 'end'
      ? state.value.statements.length
      : resolveInsertIndexAfterSelection()
    editorStore.applySceneStatementInsert(state.value.path, newEntries, insertAt)

    const lastInserted = newEntries.at(-1)
    if (lastInserted) {
      void restoreSelectedStatementPresentation({ align: 'auto' })
    }
    requestAutoSave()
  }

  useCommandPanelBridgeBinding({
    isActive: isCurrentVisualProjectionActive,
    insertCommand(type) {
      const rawText = commandPanelStore.getInsertText(type)
      insertRawTexts([rawText])
    },
    insertGroup(group) {
      insertRawTexts(group.rawTexts)
    },
  })

  function isStatementCollapsed(statementId: number): boolean {
    return editorStore.isSceneStatementCollapsed(state.value.path, statementId)
  }

  function handleCollapsedUpdate(statementId: number, collapsed: boolean) {
    editorStore.setSceneStatementCollapsed(state.value.path, statementId, collapsed)
  }

  function handleStatementUpdate(payload: StatementUpdatePayload) {
    const target = payload.target
    if (target.kind !== 'statement') {
      logger.warn(`可视化场景编辑收到非语句目标更新 (${state.value.path})`)
      return
    }

    const statements = state.value.statements
    const index = statements.findIndex(entry => entry.id === target.statementId)
    if (index === -1) {
      return
    }

    const entry = statements[index]
    if (entry.rawText === payload.rawText) {
      return
    }

    editorStore.applySceneStatementUpdate(
      state.value.path,
      target.statementId,
      payload.rawText,
      payload.source ?? 'visual',
    )

    requestAutoSave()
  }

  function handleSelect(id: number) {
    const currentSelectedStatementId = readSelectedStatementId()
    const wasAlreadySelected = currentSelectedStatementId === id

    const lineNumber = resolveStatementLineNumber(id)
    syncSceneSelectionFromStatement(id, {
      lastEditedStatementId: id,
      lineNumber,
    })

    if (!wasAlreadySelected) {
      syncStatementPreview(id)
    }
  }

  function handlePlayTo(id: number) {
    syncStatementPreview(id, true)
  }

  watch(() => preferenceStore.showSidebar, (show) => {
    if (show && readSelectedStatementId() === undefined) {
      autoSelectFromLineNumber()
    }
  })

  watch(
    () => state.value.statements.map(statement => statement.id),
    () => {
      ensureSelectedStatementPresent()
    },
  )

  watch(
    [
      () => activeProjection.value,
      () => tabsStore.activeTab?.path,
    ],
    ([projection, activePath]) => {
      const shouldActivateVisualProjection = projection === 'visual'
        && activePath === state.value.path
        && editorStore.consumePendingSceneProjectionActivation(state.value.path, 'visual')
      if (!shouldActivateVisualProjection) {
        return
      }

      void viewport.restoreSelectionAndScroll()
    },
    { immediate: true },
  )

  const sceneShortcutWhen = {
    panelFocus: 'editor',
    visualType: 'scene',
  } as const

  useShortcut({
    allowInInput: true,
    execute: performUndo,
    i18nKey: 'shortcut.visual.undo',
    id: 'visual.undo',
    keys: 'Mod+Z',
    when: sceneShortcutWhen,
  })

  useShortcut({
    allowInInput: true,
    execute: performRedo,
    i18nKey: 'shortcut.visual.redo',
    id: 'visual.redo',
    keys: ['Mod+Shift+Z', 'Mod+Y'],
    when: sceneShortcutWhen,
  })

  useShortcut({
    execute: copyStatement,
    i18nKey: 'shortcut.visual.copy',
    id: 'visual.copy',
    keys: 'Mod+C',
    when: {
      ...sceneShortcutWhen,
      hasSelection: true,
    },
  })

  useShortcut({
    execute: cutStatement,
    i18nKey: 'shortcut.visual.cut',
    id: 'visual.cut',
    keys: 'Mod+X',
    when: {
      ...sceneShortcutWhen,
      hasSelection: true,
    },
  })

  useShortcut({
    execute: pasteStatement,
    i18nKey: 'shortcut.visual.paste',
    id: 'visual.paste',
    keys: 'Mod+V',
    when: sceneShortcutWhen,
  })

  useShortcut({
    execute: duplicateSelectedStatement,
    i18nKey: 'shortcut.visual.duplicate',
    id: 'visual.duplicate',
    keys: 'Mod+D',
    when: {
      ...sceneShortcutWhen,
      hasSelection: true,
    },
  })

  useShortcut({
    execute: () => {
      const currentSelectedStatementId = readSelectedStatementId()
      if (currentSelectedStatementId !== undefined) {
        handleStatementDelete(currentSelectedStatementId)
      }
    },
    i18nKey: 'shortcut.visual.delete',
    id: 'visual.delete',
    keys: 'Delete',
    when: {
      ...sceneShortcutWhen,
      hasSelection: true,
    },
  })

  useShortcut({
    execute: () => {
      moveSelectedStatement(-1)
    },
    i18nKey: 'shortcut.visual.moveUp',
    id: 'visual.moveUp',
    keys: 'Mod+ArrowUp',
    when: {
      ...sceneShortcutWhen,
      hasSelection: true,
    },
  })

  useShortcut({
    execute: () => {
      moveSelectedStatement(1)
    },
    i18nKey: 'shortcut.visual.moveDown',
    id: 'visual.moveDown',
    keys: 'Mod+ArrowDown',
    when: {
      ...sceneShortcutWhen,
      hasSelection: true,
    },
  })

  return {
    canHandleFileDrop,
    handleCollapsedUpdate,
    handleFileDrop,
    handlePlayTo,
    handleSelect,
    handleStatementDelete,
    handleStatementUpdate,
    isPositioning: viewport.isPositioning,
    isStatementCollapsed,
    measureRowElement: viewport.measureRowElement,
    previousSpeakers,
    reorderStatements,
    selectedStatementId,
    statementSortVirtualAdapter: viewport.statementSortVirtualAdapter,
    totalSize: viewport.totalSize,
    virtualRows: viewport.virtualRows,
  }
}
