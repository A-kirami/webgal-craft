<script setup lang="ts">
import { ChevronDown, Pencil, Plus, Trash } from '@lucide/vue'

import type { Flowchart } from '~/domain/flowchart/model'

interface Props {
  activeFlowchartId: string
  flowcharts: Flowchart[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  create: []
  delete: [flowchartId: string]
  rename: [flowchartId: string, name: string]
  select: [flowchartId: string]
}>()

const { t } = useI18n()

let isOpen = $ref(false)
let renamingFlowchartId = $ref<string>()
let renameDraft = $ref('')
let pendingDelete = $ref<Flowchart>()

const activeFlowchart = computed(() =>
  props.flowcharts.find(flowchart => flowchart.id === props.activeFlowchartId),
)

function kindLabel(flowchart: Flowchart): string {
  return flowchart.kind === 'main'
    ? t('edit.flowchart.manager.kindMain')
    : t('edit.flowchart.manager.kindBranch')
}

function handleSelect(flowchartId: string) {
  emit('select', flowchartId)
  isOpen = false
}

function startRenaming(flowchart: Flowchart) {
  renamingFlowchartId = flowchart.id
  renameDraft = flowchart.name
  void nextTick(() => {
    const input = document.querySelector<HTMLInputElement>('[data-flowchart-rename-input]')
    input?.focus()
    input?.select()
  })
}

function commitRename() {
  const flowchartId = renamingFlowchartId
  if (!flowchartId) {
    return
  }

  renamingFlowchartId = undefined
  const nextName = renameDraft.trim()
  if (!nextName) {
    return
  }

  emit('rename', flowchartId, nextName)
}

function cancelRename() {
  renamingFlowchartId = undefined
}

function handleDeleteOpenChange(nextOpen: boolean) {
  if (!nextOpen) {
    pendingDelete = undefined
  }
}

function confirmDelete() {
  const flowchart = pendingDelete
  pendingDelete = undefined
  if (flowchart) {
    emit('delete', flowchart.id)
  }
}
</script>

<template>
  <Popover ::open="isOpen">
    <PopoverTrigger as-child>
      <Button
        variant="outline"
        class="text-xs px-2.5 bg-background/95 gap-1.5 h-8 w-64 shadow-md justify-start backdrop-blur"
        data-testid="flowchart-manager-trigger"
        :aria-label="$t('edit.flowchart.manager.triggerLabel', { name: activeFlowchart?.name ?? '' })"
      >
        <span class="text-muted-foreground shrink-0">{{ $t('edit.flowchart.manager.labelPrefix') }}</span>
        <span
          v-if="activeFlowchart"
          class="text-[10px] leading-4 px-1 rounded shrink-0"
          :class="activeFlowchart.kind === 'main' ? 'text-violet-700 bg-violet-500/10 dark:text-violet-400' : 'text-blue-700 bg-blue-500/10 dark:text-blue-400'"
        >
          {{ kindLabel(activeFlowchart) }}
        </span>
        <span class="truncate">{{ activeFlowchart?.name }}</span>
        <ChevronDown class="text-muted-foreground ml-auto shrink-0 size-3.5" aria-hidden="true" />
      </Button>
    </PopoverTrigger>

    <PopoverContent align="start" class="p-1 w-[var(--reka-popover-trigger-width)]">
      <ul
        class="flex flex-col max-h-72 overflow-y-auto"
        role="listbox"
        :aria-label="$t('edit.flowchart.manager.listLabel')"
      >
        <li
          v-for="flowchart in flowcharts"
          :key="flowchart.id"
          :aria-selected="flowchart.id === activeFlowchartId"
          role="option"
          class="px-1 rounded flex gap-1 items-center"
          :class="[$style.row, flowchart.id === activeFlowchartId ? 'bg-accent' : 'hover:bg-muted/60']"
        >
          <component
            :is="renamingFlowchartId === flowchart.id ? 'div' : 'button'"
            :type="renamingFlowchartId === flowchart.id ? undefined : 'button'"
            class="text-xs px-1 text-left flex flex-1 gap-1.5 h-7 min-w-0 items-center"
            :class="flowchart.id === activeFlowchartId ? 'text-primary' : 'text-foreground'"
            :data-testid="`flowchart-select-${flowchart.id}`"
            @click="renamingFlowchartId !== flowchart.id && handleSelect(flowchart.id)"
          >
            <span class="text-muted-foreground shrink-0">{{ $t('edit.flowchart.manager.labelPrefix') }}</span>
            <span
              class="text-[10px] leading-4 px-1 rounded shrink-0"
              :class="flowchart.kind === 'main' ? 'text-violet-700 bg-violet-500/10 dark:text-violet-400' : 'text-blue-700 bg-blue-500/10 dark:text-blue-400'"
            >
              {{ kindLabel(flowchart) }}
            </span>
            <input
              v-if="renamingFlowchartId === flowchart.id"
              v-model="renameDraft"
              data-flowchart-rename-input
              type="text"
              class="text-xs text-foreground px-1 outline-none border border-primary/40 rounded bg-background flex-1 h-6 min-w-0 w-full"
              :aria-label="$t('edit.flowchart.manager.renameInputLabel')"
              @blur="commitRename"
              @keydown.enter.prevent="commitRename"
              @keydown.esc.prevent="cancelRename"
            >
            <span v-else class="truncate">{{ flowchart.name }}</span>
          </component>

          <div class="flex shrink-0 gap-0.5 items-center" :class="$style.actions">
            <Button
              variant="ghost"
              size="icon-xs"
              class="text-muted-foreground rounded"
              :aria-label="$t('edit.flowchart.manager.rename', { name: flowchart.name })"
              :data-testid="`flowchart-rename-${flowchart.id}`"
              @click="startRenaming(flowchart)"
            >
              <Pencil />
            </Button>
            <Button
              v-if="flowchart.kind !== 'main'"
              variant="ghost"
              size="icon-xs"
              class="text-muted-foreground rounded hover:text-destructive"
              :aria-label="$t('edit.flowchart.manager.delete', { name: flowchart.name })"
              :data-testid="`flowchart-delete-${flowchart.id}`"
              @click="pendingDelete = flowchart"
            >
              <Trash />
            </Button>
          </div>
        </li>
      </ul>

      <Separator class="my-1" />

      <button
        type="button"
        class="text-xs px-2 py-1.5 rounded flex gap-1.5 w-full items-center hover:bg-muted/60"
        data-testid="flowchart-create-branch"
        @click="emit('create')"
      >
        <Plus class="size-3.5" aria-hidden="true" />
        {{ $t('edit.flowchart.manager.createBranch') }}
      </button>
    </PopoverContent>
  </Popover>

  <AlertDialog :open="pendingDelete !== undefined" @update:open="handleDeleteOpenChange">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {{ $t('edit.flowchart.manager.deleteTitle') }}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {{ $t('edit.flowchart.manager.deleteDescription', { name: pendingDelete?.name ?? '' }) }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel data-testid="flowchart-delete-cancel">
          {{ $t('common.cancel') }}
        </AlertDialogCancel>
        <Button
          variant="destructive"
          data-testid="flowchart-delete-confirm"
          @click="confirmDelete"
        >
          {{ $t('common.delete') }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<style module>
.row .actions {
  opacity: 0;
  transition: opacity 150ms ease-out;
}

.row:hover .actions,
.row:has(:focus-visible) .actions {
  opacity: 1;
}

@media (hover: none) {
  .row .actions {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .row .actions {
    transition: none;
  }
}
</style>
