<script setup lang="ts">
import { Trash2 } from '@lucide/vue'

import { getFilePickerName } from '~/features/file-picker/file-picker'

interface Props {
  clearLabel: string
  invalidMap?: Record<string, boolean>
  items: string[]
  title: string
}

const {
  clearLabel,
  invalidMap = {},
  items,
  title,
} = defineProps<Props>()

const emit = defineEmits<{
  clear: []
  select: [path: string]
}>()

let chipRefs = $ref<Record<number, HTMLButtonElement>>({})

function isInvalid(path: string): boolean {
  return invalidMap[path] === true
}

function setChipRef(index: number, element: Element | null) {
  if (element instanceof HTMLButtonElement) {
    chipRefs[index] = element
    return
  }

  delete chipRefs[index]
}

function focusChip(index: number) {
  const button = chipRefs[index]
  if (!button) {
    return
  }

  button.focus()
  button.scrollIntoView({ block: 'nearest' })
}

function handleChipKeydown(event: KeyboardEvent, index: number) {
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    focusChip(Math.max(0, index - 1))
    return
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault()
    focusChip(Math.min(items.length - 1, index + 1))
  }
}
</script>

<template>
  <div class="px-2 py-1.5 border-t flex flex-col">
    <div class="flex min-w-0 items-center justify-between">
      <div class="text-xs text-muted-foreground">
        {{ title }}
      </div>
      <Button
        variant="ghost"
        size="icon"
        class="text-muted-foreground shrink-0 size-5 hover:text-primary"
        :title="clearLabel"
        :aria-label="clearLabel"
        @click="emit('clear')"
      >
        <Trash2 class="size-3!" />
      </Button>
    </div>
    <div class="py-1 max-h-[3.5rem] overflow-hidden">
      <div class="flex flex-wrap gap-1">
        <button
          v-for="(path, index) in items"
          :key="path"
          :ref="element => setChipRef(index, element as Element | null)"
          type="button"
          class="text-[11px] px-1.5 py-0.5 border rounded inline-flex gap-0.5 max-w-32 items-center focus-visible:outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
          :class="{ 'text-muted-foreground border-dashed': isInvalid(path) }"
          :title="path"
          @click="emit('select', path)"
          @keydown="(event) => handleChipKeydown(event, index)"
        >
          <span class="truncate">{{ getFilePickerName(path) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
