import { useCommandPanelBridgeBinding, useSidebarPanelBinding } from '~/composables/useEditorPanelBindings'
import { createStatementIdTarget, StatementUpdatePayload } from '~/composables/useStatementEditor'
import { useVisualEditorSceneViewport } from '~/composables/useVisualEditorSceneViewport'
import { resolveHistoryShortcutAction } from '~/helper/history-shortcut'
import { canRestoreVisualEditorCardFocus, findSelectedVisualEditorStatementCard } from '~/helper/visual-editor-focus'
import { buildStatements, StatementEntry } from '~/helper/webgal-script/sentence'
import { computeLineNumberFromStatementId, computeStatementIdFromLineNumber } from '~/models/scene-selection'
import { useCommandPanelStore } from '~/stores/command-panel'
import { useEditSettingsStore } from '~/stores/edit-settings'
import { isEditableEditor, SceneVisualProjectionState, useEditorStore } from '~/stores/editor'
import { useEditorViewStateStore } from '~/stores/editor-view-state'
import { usePreferenceStore } from '~/stores/preference'
import { useTabsStore } from '~/stores/tabs'
import { buildPreviousSpeakers } from '~/utils/speaker'

interface UseVisualEditorSceneRuntimeOptions {
  getScrollArea: () => InstanceType<typeof ScrollArea> | null | undefined
  getState: () => SceneVisualProjectionState
}

export function useVisualEditorSceneRuntime(options: UseVisualEditorSceneRuntimeOptions) {
  const editorStore = useEditorStore()
  const editorViewStateStore = useEditorViewStateStore()
  const tabsStore = useTabsStore()
  const editSettings = useEditSettingsStore()
  const preferenceStore = usePreferenceStore()
  const commandPanelStore = useCommandPanelStore()

  let statementClipboard: string | undefined
  const state = computed(() => options.getState())
  const activeProjection = computed(() => {
    const currentState = editorStore.currentState
    return currentState && isEditableEditor(currentState) ? currentState.projection : undefined
  })

  function requestAutoSave(): void {
    editorStore.scheduleAutoSaveIfEnabled(state.value.path)
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

  function isEditingText() {
    const element = document.activeElement
    if (!element) {
      return false
    }

    const tagName = element.tagName
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || (element as HTMLElement).isContentEditable
  }

  function copyStatement() {
    const entry = readSelectedStatement()
    if (entry) {
      statementClipboard = entry.rawText
    }
  }

  function handleStatementDelete(id: number) {
    if (!state.value.statements.some(entry => entry.id === id)) {
      return
    }

    editorStore.applySceneStatementDelete(state.value.path, id)

    requestAutoSave()
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
    requestAutoSave()
  }

  useEventListener('keydown', (event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return
    }

    if (activeProjection.value === 'text') {
      return
    }

    const historyAction = resolveHistoryShortcutAction(event)
    if (historyAction) {
      event.preventDefault()
      if (historyAction === 'redo') {
        performRedo()
      } else {
        performUndo()
      }
      return
    }

    if (!(event.ctrlKey || event.metaKey)) {
      return
    }

    const key = event.key.toLowerCase()
    if (isEditingText()) {
      return
    }

    switch (key) {
      case 'c': {
        event.preventDefault()
        copyStatement()
        break
      }
      case 'x': {
        event.preventDefault()
        cutStatement()
        break
      }
      case 'v': {
        event.preventDefault()
        pasteStatement()
        break
      }
      // No default
    }
  })

  const previousSpeakers = computed(() => buildPreviousSpeakers(state.value.statements))
  const viewport = useVisualEditorSceneViewport({
    getActiveProjection: () => activeProjection.value,
    getActiveTabPath: () => tabsStore.activeTab?.path,
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
      const entry = state.value.statements.find(statement => statement.id === id)
      if (entry && lineNumber !== undefined) {
        editorStore.syncScenePreview(state.value.path, lineNumber, entry.rawText)
      }
    }
  }

  function handlePlayTo(id: number) {
    const entry = state.value.statements.find(statement => statement.id === id)
    if (!entry) {
      return
    }

    const lineNumber = resolveStatementLineNumber(id)
    if (lineNumber !== undefined) {
      editorStore.syncScenePreview(state.value.path, lineNumber, entry.rawText, true)
    }
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

  return {
    handleCollapsedUpdate,
    handlePlayTo,
    handleSelect,
    handleStatementDelete,
    handleStatementUpdate,
    isPositioning: viewport.isPositioning,
    isStatementCollapsed,
    measureRowElement: viewport.measureRowElement,
    previousSpeakers,
    selectedStatementId,
    totalSize: viewport.totalSize,
    virtualRows: viewport.virtualRows,
  }
}
