<script setup lang="ts">
import { ResizablePanel } from '~/components/ui/resizable'
import { useCommandPanelBridgeProvider, useSidebarPanelProvider } from '~/composables/useEditorPanelBindings'
import { useEffectEditorProvider } from '~/composables/useEffectEditorProvider'
import { useStatementAnimationDialog } from '~/composables/useStatementAnimationDialog'
import { resolveHistoryShortcutAction } from '~/helper/history-shortcut'
import { StatementGroup } from '~/stores/command-panel'
import { useEditSettingsStore } from '~/stores/edit-settings'
import { isEditableEditor, useEditorStore } from '~/stores/editor'
import { usePreferenceStore } from '~/stores/preference'
import { useTabsStore } from '~/stores/tabs'
import { Transform } from '~/types/stage'

import type { commandType } from 'webgal-parser/src/interface/sceneInterface'

const editorStore = useEditorStore()
const preferenceStore = usePreferenceStore()
const editSettingsStore = useEditSettingsStore()
const { t } = useI18n()

const effectEditorProvider = useEffectEditorProvider()
const statementAnimationDialog = useStatementAnimationDialog()
const tabsStore = useTabsStore()

const commandPanelRef = useTemplateRef<InstanceType<typeof ResizablePanel>>('commandPanel')
const sidebarHistoryScopeRef = $(useTemplateRef<HTMLDivElement>('sidebarHistoryScope'))

// 综合 showSidebar 偏好和当前文件是否支持辅助面板
// get/set 故意不对称：setter 只写偏好，getter 额外受 isCurrentSceneFile 约束，
// 这样切回场景文件时能自动恢复用户上次的偏好值
const effectiveShowSidebar = computed({
  get: () => preferenceStore.showSidebar && editorStore.isCurrentSceneFile,
  set: (val: boolean) => {
    preferenceStore.showSidebar = val
  },
})

// 辅助面板单实例：各编辑器通过 inject 注册数据源，EditorPanel 统一渲染
const sidebarPanel = useSidebarPanelProvider()
const binding = $computed(() => sidebarPanel.activeBinding.value)
const selectedStatement = $computed(() => binding?.getEntry())
const selectedStatementUpdateTarget = $computed(() => binding?.getUpdateTarget?.())
const selectedStatementIndex = $computed(() => binding?.getIndex?.())
const selectedStatementPreviousSpeaker = $computed(() => binding?.getPreviousSpeaker?.() ?? '')
const enableFocusStatement = $computed(() => binding?.enableFocusStatement ?? false)

// 命令面板桥接：子编辑器注册插入处理器，CommandPanel 通过 bridge 调用
const commandPanelBridge = useCommandPanelBridgeProvider()
const commandPanelBinding = $computed(() => commandPanelBridge.activeBinding.value)
const isCurrentSceneFile = $computed(() => editorStore.isCurrentSceneFile)

const currentProjection = $computed(() => {
  const state = editorStore.currentState
  return state && isEditableEditor(state) ? state.projection : undefined
})
const isTextMode = $computed(() => currentProjection === 'text')
const sidebarEmptyText = $computed(() => (
  isTextMode
    ? t('edit.textEditor.formPanel.noStatement')
    : t('edit.visualEditor.noSelection')
))

const isCommandPanelCollapsed = $computed(() => commandPanelRef.value?.isCollapsed ?? true)

function toggleCommandPanel(): void {
  const panel = commandPanelRef.value
  if (!panel) {
    return
  }
  if (panel.isCollapsed) {
    panel.expand()
  } else {
    panel.collapse()
  }
}

function isSidebarHistoryShortcutTarget(event: KeyboardEvent): boolean {
  const scope = sidebarHistoryScopeRef
  if (!scope) {
    return false
  }

  const target = event.target instanceof Node ? event.target : document.activeElement
  return target instanceof Node && scope.contains(target)
}

useEventListener('keydown', (event: KeyboardEvent) => {
  const action = resolveHistoryShortcutAction(event)
  if (!action || !isSidebarHistoryShortcutTarget(event)) {
    return
  }

  const handleHistory = action === 'redo' ? binding?.handleRedo : binding?.handleUndo
  if (!handleHistory) {
    return
  }

  event.preventDefault()
  handleHistory()
})

const editorPanelRef = $(useTemplateRef('editorPanel'))
const effectEditorSession = $computed(() => effectEditorProvider.session)

function focusTextEditorAfterEffectEditorClose(): void {
  if (currentProjection === 'text') {
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
  commandPanelBinding?.insertCommand(type)
}

function handleInsertGroup(group: StatementGroup): void {
  commandPanelBinding?.insertGroup(group)
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
          <div ref="sidebarHistoryScope" class="h-full">
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
          class="p-4 max-w-none w-100 absolute sm:max-w-none"
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
