<script setup lang="ts">
import { useStatementAnimationDialog } from '~/features/editor/animation/useStatementAnimationDialog'
import { getCategoryLabel } from '~/features/editor/command-registry/index'
import { resolveI18n } from '~/features/editor/command-registry/schema'
import { useEffectEditorDialog } from '~/features/editor/effect-editor/useEffectEditorDialog'
import { useStatementGroupDraft } from '~/features/modals/statement-group/useStatementGroupDraft'
import { StatementGroup, useCommandPanelStore } from '~/stores/command-panel'
import { isEditableEditor, useEditorStore } from '~/stores/editor'
import { useModalStore } from '~/stores/modal'

interface Props {
  group?: StatementGroup
}

const props = defineProps<Props>()

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const commandPanelStore = useCommandPanelStore()
const editorStore = useEditorStore()
const modalStore = useModalStore()
const effectDialog = useEffectEditorDialog()
const animationDialog = useStatementAnimationDialog()
const initialEditorMode = computed(() => {
  const currentState = editorStore.currentState
  return currentState && isEditableEditor(currentState) ? currentState.projection : 'visual'
})

const {
  canSave,
  draftEntries,
  draftName,
  draftText,
  editorMode,
  groupedCommandEntries,
  handleAppendCommand,
  handleCollapsedUpdate,
  handleDialogOpenAutoFocus,
  handleDialogOpenChange,
  handleEntryUpdate,
  handleSaveGroup,
  isEditing,
  isEntryAtFactory,
  isEntryCollapsed,
  moveEntry,
  previousSpeakers,
  requestClose,
  resetEntry,
  switchEditorMode,
  textModeHasLoss,
  deleteEntry,
} = useStatementGroupDraft({
  commandPanelStore,
  group: computed(() => props.group),
  initialEditorMode,
  modalStore,
  open,
  t,
})

function handleEditorModeChange(value: unknown): void {
  const nextMode = Array.isArray(value) ? value[0] : value
  if (nextMode === 'text' || nextMode === 'visual') {
    switchEditorMode(nextMode)
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="handleDialogOpenChange">
    <DialogScrollContent
      class="grid-rows-[auto_minmax(0,1fr)_auto] h-[70vh] max-h-[85vh] max-w-4xl min-h-120 overflow-hidden"
      @open-auto-focus="handleDialogOpenAutoFocus"
    >
      <DialogHeader class="shrink-0">
        <DialogTitle class="flex gap-2 items-center">
          <span v-if="isEditing">{{ $t('edit.visualEditor.commandPanel.editGroup') }}</span>
          <span v-else>{{ $t('edit.visualEditor.commandPanel.createGroup') }}</span>
          <span class="text-muted-foreground">—</span>
          <Input
            v-model="draftName"
            :placeholder="$t('edit.visualEditor.commandPanel.groupNamePlaceholder')"
            class="text-sm font-normal h-7 max-w-60 shadow-none placeholder:text-sm"
          />
        </DialogTitle>
        <DialogDescription>
          {{ $t('edit.visualEditor.commandPanel.groupDescription') }}
        </DialogDescription>
        <div
          v-if="editorMode === 'text' && textModeHasLoss"
          role="alert"
          class="text-xs text-destructive px-3 py-2 border border-destructive/30 rounded-md bg-destructive/5"
        >
          {{ $t('edit.visualEditor.commandPanel.editorMode.lossWarning') }}
        </div>
      </DialogHeader>

      <Tabs
        :model-value="editorMode"
        :aria-label="$t('edit.visualEditor.commandPanel.editorMode.label')"
        class="gap-0 grid h-full min-h-0 overflow-hidden md:grid-cols-[180px_minmax(0,1fr)]"
        @update:model-value="handleEditorModeChange"
      >
        <div class="border-r flex flex-col min-h-0">
          <TabsList class="mb-2 mr-1 p-0.75 shrink-0 h-8">
            <TabsTrigger value="text" class="text-[13px] flex-1 h-full data-[state=active]:shadow-none">
              {{ $t('edit.visualEditor.commandPanel.editorMode.text') }}
            </TabsTrigger>
            <TabsTrigger value="visual" class="text-[13px] flex-1 h-full data-[state=active]:shadow-none">
              {{ $t('edit.visualEditor.commandPanel.editorMode.visual') }}
            </TabsTrigger>
          </TabsList>

          <ScrollArea class="flex-1 min-h-0">
            <div class="pr-2 flex flex-col gap-4">
              <section v-for="commandGroup in groupedCommandEntries" :key="commandGroup.category" class="flex flex-col gap-2">
                <h3 class="text-13px text-muted-foreground tracking-wide font-medium uppercase">
                  {{ getCategoryLabel(commandGroup.category, t) }}
                </h3>
                <Button
                  v-for="entry in commandGroup.entries"
                  :key="entry.type"
                  variant="ghost"
                  class="px-3 py-2 opacity-80 h-8 justify-start hover:opacity-100"
                  @click="handleAppendCommand(entry.type)"
                >
                  <div class="shrink-0 size-3.5" :class="entry.icon" />
                  <span class="text-[13px] truncate">{{ resolveI18n(entry.label, t) }}</span>
                </Button>
              </section>
            </div>
          </ScrollArea>
        </div>

        <TabsContent value="text" class="mt-0 px-2 h-full min-h-0 min-w-0 overflow-hidden">
          <StatementGroupTextEditor
            v-model="draftText"
            :aria-label="$t('edit.visualEditor.commandPanel.editorMode.text')"
          />
        </TabsContent>

        <TabsContent value="visual" class="mt-0 h-full min-h-0 min-w-0 overflow-hidden">
          <ScrollArea class="flex-scroll-area h-full min-h-0">
            <div v-if="draftEntries.length > 0" class="px-2 flex flex-col gap-2">
              <VisualEditorStatementCard
                v-for="(entry, index) in draftEntries"
                :key="entry.id"
                :collapsed="isEntryCollapsed(entry.id)"
                :entry="entry"
                :index="index"
                :previous-speaker="previousSpeakers[index]"
                @update="handleEntryUpdate"
                @update:collapsed="val => handleCollapsedUpdate(index, val)"
              >
                <template #actions>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="p-1 opacity-70 size-7 hover:opacity-100"
                    :disabled="index === 0"
                    :title="$t('edit.visualEditor.commandPanel.moveUp')"
                    @click.stop="moveEntry(index, -1)"
                  >
                    <div class="i-lucide-arrow-up size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="p-1 opacity-70 size-7 hover:opacity-100"
                    :disabled="index === draftEntries.length - 1"
                    :title="$t('edit.visualEditor.commandPanel.moveDown')"
                    @click.stop="moveEntry(index, 1)"
                  >
                    <div class="i-lucide-arrow-down size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="p-1 opacity-70 size-7 hover:opacity-100"
                    :disabled="isEntryAtFactory(entry)"
                    :title="$t('edit.visualEditor.commandPanel.resetDefaults')"
                    @click.stop="resetEntry(entry.id)"
                  >
                    <div class="i-lucide-rotate-ccw size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="p-1 opacity-70 size-7 hover:text-destructive hover:opacity-100"
                    :title="$t('common.delete')"
                    @click.stop="deleteEntry(entry.id)"
                  >
                    <div class="i-lucide-trash-2 size-3" />
                  </Button>
                </template>
              </VisualEditorStatementCard>
            </div>
            <div v-else class="text-sm text-muted-foreground px-6 flex h-full items-center justify-center">
              {{ $t('edit.visualEditor.commandPanel.emptyGroup') }}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <DialogFooter class="shrink-0">
        <Button variant="outline" class="h-8" @click="requestClose">
          {{ $t('common.cancel') }}
        </Button>
        <Button class="h-8" :disabled="!canSave" @click="handleSaveGroup">
          {{ $t('edit.visualEditor.commandPanel.saveGroup') }}
        </Button>
      </DialogFooter>
    </DialogScrollContent>

    <!-- 效果编辑器二级 Dialog -->
    <EffectEditorSubDialog :effect-dialog="effectDialog" />

    <!-- 动画编辑器二级 Dialog -->
    <StatementAnimationSubDialog :animation-dialog="animationDialog" />
  </Dialog>
</template>
