<script setup lang="ts">
import { useStatementGroupDraft } from '~/components/modals/useStatementGroupDraft'
import { useEffectEditorDialog } from '~/composables/useEffectEditorDialog'
import { useStatementAnimationDialog } from '~/composables/useStatementAnimationDialog'
import { getCategoryLabel } from '~/helper/command-registry/index'
import { resolveI18n } from '~/helper/command-registry/schema'
import { StatementGroup, useCommandPanelStore } from '~/stores/command-panel'
import { useModalStore } from '~/stores/modal'

interface Props {
  group?: StatementGroup
}

const props = defineProps<Props>()

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const commandPanelStore = useCommandPanelStore()
const modalStore = useModalStore()
const effectDialog = useEffectEditorDialog()
const animationDialog = useStatementAnimationDialog()
const {
  canSave,
  draftEntries,
  draftName,
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
  deleteEntry,
} = useStatementGroupDraft({
  commandPanelStore,
  group: computed(() => props.group),
  modalStore,
  open,
  t,
})
</script>

<template>
  <Dialog :open="open" @update:open="handleDialogOpenChange">
    <DialogScrollContent class="max-w-4xl" @open-auto-focus="handleDialogOpenAutoFocus">
      <div class="flex flex-col gap-4 h-[70vh] min-h-120">
        <DialogHeader>
          <DialogTitle class="flex gap-2 items-center">
            <span v-if="isEditing">{{ $t('edit.visualEditor.commandPanel.editGroup') }}</span>
            <span v-else>{{ $t('edit.visualEditor.commandPanel.createGroup') }}</span>
            <span class="text-muted-foreground">—</span>
            <Input
              v-model="draftName"
              :placeholder="$t('edit.visualEditor.commandPanel.groupNamePlaceholder')"
              class="text-base font-normal h-7 max-w-60 shadow-none"
            />
          </DialogTitle>
          <DialogDescription>
            {{ $t('edit.visualEditor.commandPanel.groupDescription') }}
          </DialogDescription>
        </DialogHeader>

        <div class="flex-1 gap-0 grid min-h-0 md:grid-cols-[180px_minmax(0,1fr)]">
          <ScrollArea class="border-r">
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
                  <div class="mr-2 shrink-0 size-4" :class="entry.icon" />
                  <span class="text-sm truncate">{{ resolveI18n(entry.label, t) }}</span>
                </Button>
              </section>
            </div>
          </ScrollArea>

          <ScrollArea class="flex-scroll-area min-h-0">
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
        </div>

        <DialogFooter>
          <Button variant="outline" class="h-8" @click="requestClose">
            {{ $t('common.cancel') }}
          </Button>
          <Button class="h-8" :disabled="!canSave" @click="handleSaveGroup">
            {{ $t('edit.visualEditor.commandPanel.saveGroup') }}
          </Button>
        </DialogFooter>
      </div>
    </DialogScrollContent>

    <!-- 效果编辑器二级 Dialog -->
    <EffectEditorSubDialog :effect-dialog="effectDialog" />

    <!-- 动画编辑器二级 Dialog -->
    <StatementAnimationSubDialog :animation-dialog="animationDialog" />
  </Dialog>
</template>
