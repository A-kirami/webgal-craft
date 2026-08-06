import { computeStatementIdFromLineNumber } from '~/domain/document/scene-selection'
import { useStatementAnimationDialog } from '~/features/editor/animation/useStatementAnimationDialog'
import { flipTransformScaleAxis } from '~/features/editor/effect-editor/transform-flip'
import { useEffectEditorProvider } from '~/features/editor/effect-editor/useEffectEditorProvider'
import { readResizablePanelCollapsed } from '~/features/editor/shared/resizable-panel'
import { useCommandPanelBridgeProvider, useSidebarPanelProvider } from '~/features/editor/shared/useEditorPanelBindings'
import { useShortcut } from '~/features/editor/shortcut/useShortcut'
import {
  buildSceneAutocompleteOptionsFromStatements,
  EMPTY_SCENE_AUTOCOMPLETE_OPTIONS,
} from '~/features/editor/statement-editor/scene-autocomplete'
import { StatementGroup } from '~/stores/command-panel'
import { isEditableEditor, useEditorStore } from '~/stores/editor'
import { useEditorDiagnosticsStore } from '~/stores/editor-diagnostics'
import { usePreferenceStore } from '~/stores/preference'
import { useTabsStore } from '~/stores/tabs'

import type { commandType } from 'webgal-parser/src/interface/sceneInterface'
import type { Transform } from '~/domain/stage/types'
import type { SceneEditorDiagnostic } from '~/features/editor/diagnostics/types'
import type { TransformScaleAxis } from '~/features/editor/effect-editor/transform-flip'
import type { ShortcutDefinition } from '~/features/editor/shortcut/types'

interface ResizablePanelLike {
  collapse: () => void
  expand: () => void
  isCollapsed: boolean | ReadonlyRefLike<boolean>
}

interface ReadonlyRefLike<T = unknown> {
  readonly value: T
}

interface UseEditorPanelShellOptions {
  commandPanelRef: ReadonlyRefLike<ResizablePanelLike | null | undefined>
}

interface EffectEditorShortcutDefinition {
  action: () => void
  i18nKey: string
  id: string
  keys: ShortcutDefinition['keys']
}

export function useEditorPanelShell(options: UseEditorPanelShellOptions) {
  const editorStore = useEditorStore()
  const diagnosticsStore = useEditorDiagnosticsStore()
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
  const sceneAutocompleteOptions = computed(() => {
    const state = editorStore.currentVisualProjection
    if (!state || state.kind !== 'scene') {
      return EMPTY_SCENE_AUTOCOMPLETE_OPTIONS
    }

    return buildSceneAutocompleteOptionsFromStatements(state.statements)
  })
  const sceneRuntimeCapabilities = computed(() => {
    const state = editorStore.currentVisualProjection
    return state?.kind === 'scene' ? state.runtimeCapabilities : undefined
  })
  const selectedStatementDiagnostics = computed<readonly SceneEditorDiagnostic[]>(() => {
    const state = editorStore.currentVisualProjection
    const statementId = selectedStatement.value?.id
    if (!state || state.kind !== 'scene' || statementId === undefined) {
      return []
    }

    const updateTarget = selectedStatementUpdateTarget.value
    const statementIndex = selectedStatementIndex.value
      ?? (updateTarget?.kind === 'line'
        ? state.statements.findIndex(statement =>
            statement.id === computeStatementIdFromLineNumber(state.statements, updateTarget.lineNumber),
          )
        : state.statements.findIndex(statement => statement.id === statementId))
    if (statementIndex < 0 || statementIndex >= state.statements.length) {
      return []
    }

    return diagnosticsStore.readStatementDiagnostics(state.path, statementIndex)
  })
  const isTextMode = computed(() => currentProjection.value === 'text')

  const effectiveShowSidebar = computed({
    get: () => preferenceStore.showSidebar && isCurrentSceneFile.value,
    set: (value: boolean) => {
      preferenceStore.showSidebar = value
    },
  })

  const isCommandPanelCollapsed = computed(() => readResizablePanelCollapsed(options.commandPanelRef.value))
  const effectEditorSession = computed(() => effectEditorProvider.session)

  function flipEffectScaleAxis(axis: TransformScaleAxis): void {
    const currentSession = effectEditorSession.value
    if (!currentSession) {
      return
    }

    effectEditorProvider.updateDraft({
      transform: flipTransformScaleAxis({
        axis,
        baselineSource: currentSession.baselineSource,
        baselineTransform: currentSession.baselineTransform,
        transform: currentSession.draft.transform,
      }),
    })
    effectEditorProvider.requestPreview({
      flush: true,
      schedule: 'immediate',
    })
  }

  function toggleCommandPanel(): void {
    const panel = options.commandPanelRef.value
    if (!panel) {
      return
    }

    if (readResizablePanelCollapsed(panel)) {
      panel.expand()
      return
    }

    panel.collapse()
  }

  useShortcut({
    allowInInput: true,
    execute: () => {
      binding.value?.handleUndo?.()
    },
    i18nKey: 'shortcut.statementEditor.undo',
    id: 'statementEditor.undo',
    keys: 'Mod+Z',
    when: { panelFocus: 'statementEditor' },
  })

  useShortcut({
    allowInInput: true,
    execute: () => {
      binding.value?.handleRedo?.()
    },
    i18nKey: 'shortcut.statementEditor.redo',
    id: 'statementEditor.redo',
    keys: ['Mod+Shift+Z', 'Mod+Y'],
    when: { panelFocus: 'statementEditor' },
  })

  const effectEditorShortcutPanelFocuses = ['effectEditor', 'transformOverlay'] as const
  const effectEditorShortcutDefinitions: EffectEditorShortcutDefinition[] = [
    {
      action: effectEditorProvider.undoDraft,
      i18nKey: 'shortcut.effect.undo',
      id: 'effect.undo',
      keys: 'Mod+Z',
    },
    {
      action: effectEditorProvider.redoDraft,
      i18nKey: 'shortcut.effect.redo',
      id: 'effect.redo',
      keys: ['Mod+Shift+Z', 'Mod+Y'],
    },
    {
      action: effectEditorProvider.copyCurrentEffect,
      i18nKey: 'shortcut.effect.copy',
      id: 'effect.copy',
      keys: 'Mod+C',
    },
    {
      action: effectEditorProvider.pasteCurrentEffect,
      i18nKey: 'shortcut.effect.paste',
      id: 'effect.paste',
      keys: 'Mod+V',
    },
    {
      action: () => flipEffectScaleAxis('x'),
      i18nKey: 'shortcut.effect.flipHorizontal',
      id: 'effect.flipHorizontal',
      keys: 'Shift+H',
    },
    {
      action: () => flipEffectScaleAxis('y'),
      i18nKey: 'shortcut.effect.flipVertical',
      id: 'effect.flipVertical',
      keys: 'Shift+V',
    },
  ]

  for (const panelFocus of effectEditorShortcutPanelFocuses) {
    for (const shortcut of effectEditorShortcutDefinitions) {
      useShortcut({
        execute: shortcut.action,
        i18nKey: shortcut.i18nKey,
        id: shortcut.id,
        keys: shortcut.keys,
        when: { panelFocus },
      })
    }
  }

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
    sceneAutocompleteOptions,
    sceneRuntimeCapabilities,
    selectedStatement,
    selectedStatementDiagnostics,
    selectedStatementIndex,
    selectedStatementPreviousSpeaker,
    selectedStatementUpdateTarget,
    statementAnimationDialog,
    closeEffectEditor,
    handleEffectApply,
    handleEffectEditorSheetOpenChange,
    handleEffectTransformUpdate,
    handleInsertCommand,
    handleInsertGroup,
    toggleCommandPanel,
  }
}
