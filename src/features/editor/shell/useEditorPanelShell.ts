import { useStatementAnimationDialog } from '~/features/editor/animation/useStatementAnimationDialog'
import { useEffectEditorProvider } from '~/features/editor/effect-editor/useEffectEditorProvider'
import { resolveHistoryShortcutAction } from '~/features/editor/shared/history-shortcut'
import { useCommandPanelBridgeProvider, useSidebarPanelProvider } from '~/features/editor/shared/useEditorPanelBindings'
import { StatementGroup } from '~/stores/command-panel'
import { isEditableEditor, useEditorStore } from '~/stores/editor'
import { usePreferenceStore } from '~/stores/preference'
import { useTabsStore } from '~/stores/tabs'

import type { commandType } from 'webgal-parser/src/interface/sceneInterface'
import type { Transform } from '~/domain/stage/types'

interface ResizablePanelLike {
  collapse: () => void
  expand: () => void
  isCollapsed: boolean
}

interface ReadonlyRefLike<T = unknown> {
  readonly value: T
}

interface UseEditorPanelShellOptions {
  commandPanelRef: ReadonlyRefLike<ResizablePanelLike | null | undefined>
  sidebarHistoryScopeRef: ReadonlyRefLike<HTMLElement | null | undefined>
}

interface SidebarHistoryShortcutEvent {
  preventDefault: () => void
  target?: EventTarget | null
}

export function useEditorPanelShell(options: UseEditorPanelShellOptions) {
  const editorStore = useEditorStore()
  const preferenceStore = usePreferenceStore()
  const tabsStore = useTabsStore()

  const effectEditorProvider = useEffectEditorProvider()
  const statementAnimationDialog = useStatementAnimationDialog()

  const sidebarPanel = useSidebarPanelProvider()
  const commandPanelBridge = useCommandPanelBridgeProvider()

  const binding = computed(() => sidebarPanel.activeBinding.value)
  const commandPanelBinding = computed(() => commandPanelBridge.activeBinding.value)
  const selectedStatement = computed(() => binding.value?.getEntry())
  const selectedStatementUpdateTarget = computed(() => binding.value?.getUpdateTarget?.())
  const selectedStatementIndex = computed(() => binding.value?.getIndex?.())
  const selectedStatementPreviousSpeaker = computed(() => binding.value?.getPreviousSpeaker?.() ?? '')
  const enableFocusStatement = computed(() => binding.value?.enableFocusStatement ?? false)
  const isCurrentSceneFile = computed(() => editorStore.isCurrentSceneFile)
  const currentProjection = computed(() => {
    const state = editorStore.currentState
    return state && isEditableEditor(state) ? state.projection : undefined
  })
  const isTextMode = computed(() => currentProjection.value === 'text')

  const effectiveShowSidebar = computed({
    get: () => preferenceStore.showSidebar && isCurrentSceneFile.value,
    set: (value: boolean) => {
      preferenceStore.showSidebar = value
    },
  })

  const isCommandPanelCollapsed = computed(() => options.commandPanelRef.value?.isCollapsed ?? true)
  const effectEditorSession = computed(() => effectEditorProvider.session)

  function toggleCommandPanel(): void {
    const panel = options.commandPanelRef.value
    if (!panel) {
      return
    }

    if (panel.isCollapsed) {
      panel.expand()
      return
    }

    panel.collapse()
  }

  function isSidebarHistoryShortcutTarget(event: SidebarHistoryShortcutEvent): boolean {
    const scopeElement = options.sidebarHistoryScopeRef.value
    if (!scopeElement) {
      return false
    }

    const target = event.target
    return !!target && scopeElement.contains(target as Node)
  }

  function handleSidebarHistoryShortcutKeydown(event: KeyboardEvent): void {
    const action = resolveHistoryShortcutAction(event)
    if (!action || !isSidebarHistoryShortcutTarget(event)) {
      return
    }

    const historyHandler = action === 'redo'
      ? binding.value?.handleRedo
      : binding.value?.handleUndo
    if (!historyHandler) {
      return
    }

    event.preventDefault()
    historyHandler()
  }

  useEventListener('keydown', handleSidebarHistoryShortcutKeydown)

  function focusTextEditorAfterEffectEditorClose(): void {
    if (currentProjection.value === 'text') {
      tabsStore.shouldFocusEditor = true
    }
  }

  async function closeEffectEditor(): Promise<void> {
    const closed = await effectEditorProvider.close()
    if (closed) {
      focusTextEditorAfterEffectEditorClose()
    }
  }

  async function handleEffectEditorSheetOpenChange(nextOpen: boolean): Promise<void> {
    if (nextOpen) {
      return
    }

    await closeEffectEditor()
  }

  function handleEffectTransformUpdate(payload: { value: Transform, deferAutoApply?: boolean }): void {
    effectEditorProvider.updateDraft(
      { transform: payload.value },
      { deferAutoApply: payload.deferAutoApply },
    )
  }

  function handleInsertCommand(type: commandType): void {
    commandPanelBinding.value?.insertCommand(type)
  }

  function handleInsertGroup(group: StatementGroup): void {
    commandPanelBinding.value?.insertGroup(group)
  }

  async function handleEffectApply(): Promise<void> {
    if (!effectEditorProvider.canApply) {
      return
    }

    const applied = await effectEditorProvider.apply()
    if (applied) {
      focusTextEditorAfterEffectEditorClose()
    }
  }

  function handleEffectReset(): void {
    if (!effectEditorProvider.canReset) {
      return
    }

    effectEditorProvider.resetToInitialDraft()
  }

  return {
    binding,
    commandPanelBinding,
    effectEditorProvider,
    effectEditorSession,
    effectiveShowSidebar,
    enableFocusStatement,
    isCommandPanelCollapsed,
    isCurrentSceneFile,
    isTextMode,
    selectedStatement,
    selectedStatementIndex,
    selectedStatementPreviousSpeaker,
    selectedStatementUpdateTarget,
    statementAnimationDialog,
    closeEffectEditor,
    handleEffectApply,
    handleEffectEditorSheetOpenChange,
    handleEffectReset,
    handleEffectTransformUpdate,
    handleInsertCommand,
    handleInsertGroup,
    handleSidebarHistoryShortcutKeydown,
    toggleCommandPanel,
  }
}
