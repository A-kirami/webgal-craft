<script setup lang="ts">
import { ResizablePanel } from '~/components/ui/resizable'
import { useEditorDiagnostics } from '~/features/editor/diagnostics/useEditorDiagnostics'
import { useEditorPanelShell } from '~/features/editor/shell/useEditorPanelShell'
import { useShortcut } from '~/features/editor/shortcut/useShortcut'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'
import { sceneAutocompleteOptionsKey } from '~/features/editor/statement-editor/scene-autocomplete-context'
import { TRANSFORM_OVERLAY_BRIDGE_KEY } from '~/features/editor/transform-overlay/context'

const commandPanelRef = useTemplateRef<InstanceType<typeof ResizablePanel>>('commandPanel')
const editorPanelRef = $(useTemplateRef('editorPanel'))
const { t } = useI18n()
useEditorDiagnostics()
const transformOverlayBridge = inject(TRANSFORM_OVERLAY_BRIDGE_KEY, undefined)
const DRAWER_INTERACTIVE_REGION_SELECTOR = '[data-drawer-interactive-region]'

const TRANSFORM_OVERLAY_FIELD_PATHS = new Set([
  'position.x',
  'position.y',
  'scale.x',
  'scale.y',
  'rotation',
])

const {
  binding,
  closeEffectEditor,
  effectEditorProvider,
  effectEditorSession,
  effectiveShowSidebar,
  enableFocusStatement,
  expandCommandPanel,
  handleEffectApply,
  handleEffectEditorSheetOpenChange,
  handleEffectTransformUpdate,
  handleInsertCommand,
  handleInsertGroup,
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
  toggleCommandPanel,
} = useEditorPanelShell({
  commandPanelRef,
})

provide(sceneAutocompleteOptionsKey, sceneAutocompleteOptions)

// 预览工作区只在该抽屉的编辑面确实落在预览区时才豁免遮罩：效果编辑器对应变换浮层可用，
// 动画编辑器的帧级浮层尚未交付，因此它打开期间点预览等同于点抽屉外
const effectEditorInteractiveRegionSelector = $computed(() =>
  transformOverlayBridge?.enabled.value === true ? DRAWER_INTERACTIVE_REGION_SELECTOR : undefined,
)

function handleAnimationEditorDrawerOpenChange(nextOpen: boolean): void {
  if (!nextOpen) {
    statementAnimationDialog.requestClose()
  }
}

function handleEffectEditorTransformUpdate(payload: Parameters<typeof handleEffectTransformUpdate>[0]): void {
  if (transformOverlayBridge?.enabled.value) {
    transformOverlayBridge.handlePanelTransformUpdate(payload)
    return
  }

  handleEffectTransformUpdate(payload)
}

function getTransformOverlayFieldValue(path: string): string | undefined {
  if (!TRANSFORM_OVERLAY_FIELD_PATHS.has(path)) {
    return undefined
  }

  const displayTransform = transformOverlayBridge?.formDisplayTransform.value
  if (!displayTransform) {
    return undefined
  }

  switch (path) {
    case 'position.x': {
      return String(displayTransform.position.x)
    }
    case 'position.y': {
      return String(displayTransform.position.y)
    }
    case 'scale.x': {
      return String(displayTransform.scale.x)
    }
    case 'scale.y': {
      return String(displayTransform.scale.y)
    }
    case 'rotation': {
      return String(displayTransform.rotation)
    }
    default: {
      return undefined
    }
  }
}

const sidebarEmptyText = $computed(() => (
  binding.value?.getEmptyState?.() === 'multiple-edit-targets'
    ? t('edit.textEditor.formPanel.multipleEditTargets')
    : (isTextMode.value
        ? t('edit.textEditor.formPanel.noStatement')
        : t('edit.visualEditor.noSelection'))
))

useShortcutContext({
  commandPanelOpen: computed(() => !isCommandPanelCollapsed.value),
})

useShortcut({
  allowInInput: true,
  execute: () => {
    void handleEffectApply()
  },
  i18nKey: 'shortcut.effect.apply',
  id: 'effect.apply',
  keys: 'Mod+Enter',
  when: { panelFocus: 'effectEditor' },
})

useShortcut({
  execute: () => {
    void handleEffectApply()
  },
  i18nKey: 'shortcut.effect.apply',
  id: 'effect.applyFromTransformOverlay',
  keys: ['Enter', 'Mod+Enter'],
  when: { panelFocus: 'transformOverlay' },
})

useShortcut({
  allowInInput: true,
  execute: () => {
    void closeEffectEditor()
  },
  i18nKey: 'shortcut.effect.close',
  id: 'effect.close',
  keys: 'Escape',
  when: { panelFocus: 'effectEditor' },
})

useShortcut({
  allowInInput: true,
  execute: () => {
    statementAnimationDialog.handleApply()
  },
  i18nKey: 'shortcut.animation.apply',
  id: 'animation.apply',
  keys: 'Mod+Enter',
  when: { panelFocus: 'animationEditor' },
})

useShortcut({
  allowInInput: true,
  execute: () => {
    statementAnimationDialog.requestClose()
  },
  i18nKey: 'shortcut.animation.close',
  id: 'animation.close',
  keys: 'Escape',
  when: { panelFocus: 'animationEditor' },
})

defineExpose({ expandCommandPanel, toggleCommandPanel })
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <div class="pr-3 border-b flex gap-2 items-center justify-between">
      <EditorTabs />
      <EditorToolbar />
    </div>
    <div ref="editorPanel" class="flex-1 min-h-0 relative overflow-hidden">
      <EditorSidebarLayout v-if="isCurrentSceneFile" ::show="effectiveShowSidebar" class="h-full">
        <div class="flex flex-col h-full relative overflow-hidden">
          <!-- 场景文件：编辑器 + 命令面板纵向分割 -->
          <ResizablePanelGroup auto-save-id="editor-vertical" direction="vertical" class="flex-1 min-h-0">
            <ResizablePanel data-tour="editor-area" size-unit="px" :min-size="200">
              <FileEditor />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel
              ref="commandPanel"
              collapsible
              size-unit="px"
              :default-size="135"
              :min-size="80"
            >
              <CommandPanel
                @insert-command="handleInsertCommand"
                @insert-group="handleInsertGroup"
              />
            </ResizablePanel>
          </ResizablePanelGroup>
          <!-- 命令面板折叠态：底部居中小标签 -->
          <button
            v-if="isCommandPanelCollapsed"
            class="text-xs text-muted-foreground px-3 py-0.5 border border-b-0 rounded-t bg-muted flex gap-1 transition-colors items-center bottom-0 left-1/2 justify-center absolute hover:text-foreground hover:bg-accent -translate-x-1/2"
            @click="toggleCommandPanel"
          >
            <div class="i-lucide-panel-bottom-open size-3.5" />
            {{ $t('edit.visualEditor.commandPanel.title') }}
          </button>
        </div>
        <template #sidebar>
          <div class="h-full">
            <StatementEditorPanel
              v-if="binding && selectedStatement"
              :entry="selectedStatement"
              :diagnostics="selectedStatementDiagnostics"
              :index="selectedStatementIndex"
              :previous-speaker="selectedStatementPreviousSpeaker"
              :runtime-capabilities="sceneRuntimeCapabilities"
              :update-target="selectedStatementUpdateTarget"
              :enable-focus-statement="enableFocusStatement"
              @update="binding.onUpdate"
              @focus-statement="binding.onFocusStatement?.()"
            />
            <div v-else-if="binding" class="text-sm text-muted-foreground px-4 flex h-full items-center justify-center">
              {{ sidebarEmptyText }}
            </div>
          </div>
        </template>
      </EditorSidebarLayout>
      <div v-else class="flex flex-col h-full relative overflow-hidden">
        <FileEditor class="flex-1 min-h-0" />
      </div>

      <EditorDrawer
        :anchor="editorPanelRef ?? undefined"
        :interactive-region-selector="effectEditorInteractiveRegionSelector"
        :open="effectEditorProvider.isOpen"
        panel-focus="effectEditor"
        data-tour="effect-editor"
        class="p-4 max-w-none w-108 sm:max-w-none"
        @update:open="handleEffectEditorSheetOpenChange"
      >
        <div class="flex flex-col h-full">
          <SheetHeader class="pr-8 gap-y-0.5">
            <SheetTitle>
              {{ $t('modals.effectEditor.title') }}
            </SheetTitle>
            <SheetDescription class="text-13px!">
              {{ $t('modals.effectEditor.description') }}
            </SheetDescription>
          </SheetHeader>
          <Separator class="mb-4 mt-2" />
          <EffectEditorPanel
            v-if="effectEditorSession"
            class="flex-1 min-h-0"
            :transform="effectEditorSession.draft.transform"
            :baseline-source="effectEditorSession.baselineSource"
            :baseline-transform="effectEditorSession.baselineTransform"
            :preview-field-value="getTransformOverlayFieldValue"
            :duration="effectEditorSession.draft.duration"
            :ease="effectEditorSession.draft.ease"
            :can-apply="effectEditorProvider.canApply"
            :can-clear="effectEditorProvider.canClear"
            @update:transform="handleEffectEditorTransformUpdate"
            @update:duration="effectEditorProvider.updateDraft({ duration: $event })"
            @update:ease="effectEditorProvider.updateDraft({ ease: $event })"
            @preview="effectEditorProvider.requestPreview"
            @cancel-preview="effectEditorProvider.cancelPreview"
            @apply="handleEffectApply"
            @clear="effectEditorProvider.clearDraft"
          />
        </div>
      </EditorDrawer>

      <EditorDrawer
        :anchor="editorPanelRef ?? undefined"
        :open="statementAnimationDialog.isOpen"
        panel-focus="animationEditor"
        class="p-4 max-w-full w-160 sm:max-w-full"
        @update:open="handleAnimationEditorDrawerOpenChange"
      >
        <div class="flex flex-col h-full">
          <SheetHeader class="pr-8 gap-y-0.5">
            <SheetTitle>
              {{ $t('edit.visualEditor.animation.title') }}
            </SheetTitle>
            <SheetDescription class="text-13px!">
              {{ $t('edit.visualEditor.animation.description') }}
            </SheetDescription>
          </SheetHeader>
          <Separator class="mb-4 mt-2" />
          <StatementAnimationEditorPanel
            class="flex-1 min-h-0"
            :frames="statementAnimationDialog.draftFrames"
            @update:frames="statementAnimationDialog.updateFrames"
            @apply="statementAnimationDialog.handleApply"
            @cancel="statementAnimationDialog.requestClose"
          />
        </div>
      </EditorDrawer>
    </div>
  </div>
</template>
