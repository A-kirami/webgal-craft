<script setup lang="ts">
import { ResizablePanel } from '~/components/ui/resizable'
import { useEditorPanelShell } from '~/features/editor/shell/useEditorPanelShell'
import { useShortcut } from '~/features/editor/shortcut/useShortcut'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'
import { useEditSettingsStore } from '~/stores/edit-settings'

const commandPanelRef = useTemplateRef<InstanceType<typeof ResizablePanel>>('commandPanel')
const editorPanelRef = $(useTemplateRef('editorPanel'))
const editSettingsStore = useEditSettingsStore()
const { t } = useI18n()

const {
  binding,
  closeEffectEditor,
  effectEditorProvider,
  effectEditorSession,
  effectiveShowSidebar,
  enableFocusStatement,
  handleEffectApply,
  handleEffectEditorSheetOpenChange,
  handleEffectReset,
  handleEffectTransformUpdate,
  handleInsertCommand,
  handleInsertGroup,
  isCommandPanelCollapsed,
  isCurrentSceneFile,
  isTextMode,
  selectedStatement,
  selectedStatementIndex,
  selectedStatementPreviousSpeaker,
  selectedStatementUpdateTarget,
  statementAnimationDialog,
  toggleCommandPanel,
} = useEditorPanelShell({
  commandPanelRef,
})

const sidebarEmptyText = $computed(() => (
  binding.value?.getEmptyState?.() === 'multiple-edit-targets'
    ? t('edit.textEditor.formPanel.multipleEditTargets')
    : (isTextMode.value
        ? t('edit.textEditor.formPanel.noStatement')
        : t('edit.visualEditor.noSelection'))
))

useShortcutContext({
  commandPanelOpen: computed(() => !isCommandPanelCollapsed.value),
  isModalOpen: computed(() => statementAnimationDialog.isOpen),
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
  allowInInput: true,
  execute: () => {
    void closeEffectEditor()
  },
  i18nKey: 'shortcut.effect.close',
  id: 'effect.close',
  keys: 'Escape',
  when: { panelFocus: 'effectEditor' },
})

defineExpose({ toggleCommandPanel })
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <div class="pr-4 border-b flex gap-2 items-center justify-between">
      <EditorTabs />
      <EditorToolbar />
    </div>
    <div ref="editorPanel" class="flex-1 min-h-0 relative overflow-hidden">
      <EditorSidebarLayout ::show="effectiveShowSidebar" class="h-full">
        <div class="flex flex-col h-full relative overflow-hidden">
          <!-- 场景文件：编辑器 + 命令面板纵向分割 -->
          <ResizablePanelGroup v-if="isCurrentSceneFile" auto-save-id="editor-vertical" direction="vertical" class="flex-1 min-h-0">
            <ResizablePanel size-unit="px" :min-size="200">
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
          <!-- 非场景文件：编辑器占满 -->
          <FileEditor v-else class="flex-1 min-h-0" />
          <!-- 命令面板折叠态：底部居中小标签 -->
          <button
            v-if="isCurrentSceneFile && isCommandPanelCollapsed"
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
              :index="selectedStatementIndex"
              :previous-speaker="selectedStatementPreviousSpeaker"
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

      <Sheet :open="effectEditorProvider.isOpen" :modal="false" @update:open="handleEffectEditorSheetOpenChange">
        <div
          v-if="effectEditorProvider.isOpen"
          class="inset-x-0 bottom-0 top-7 fixed z-40"
          aria-hidden="true"
          @click="closeEffectEditor"
        />
        <SheetContent
          :to="editorPanelRef ?? undefined"
          :overlay="false"
          :side="editSettingsStore.effectEditorSide"
          class="p-4 max-w-none w-108 absolute sm:max-w-none"
          @open-auto-focus.prevent
          @close-auto-focus.prevent
          @pointer-down-outside.prevent
          @interact-outside.prevent
        >
          <div class="flex flex-col h-full">
            <SheetHeader class="pr-8 gap-y-0.5">
              <SheetTitle class="text-base">
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
              :duration="effectEditorSession.draft.duration"
              :ease="effectEditorSession.draft.ease"
              :can-apply="effectEditorProvider.canApply"
              :can-reset="effectEditorProvider.canReset"
              @update:transform="handleEffectTransformUpdate"
              @update:duration="effectEditorProvider.updateDraft({ duration: $event })"
              @update:ease="effectEditorProvider.updateDraft({ ease: $event })"
              @preview="effectEditorProvider.requestPreview"
              @apply="handleEffectApply"
              @reset="handleEffectReset"
            />
          </div>
        </SheetContent>
      </Sheet>

      <StatementAnimationSubDialog :animation-dialog="statementAnimationDialog" />
    </div>
  </div>
</template>
