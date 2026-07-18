<script setup lang="ts">
import { Search } from '@lucide/vue'

import { cn } from '~/lib/utils'

import { createSearchOptionDocuments, filterSearchOptionDocuments } from './combobox/search'

import type { HTMLAttributes } from 'vue'

defineOptions({
  inheritAttrs: false,
})

interface ScrollAreaViewportHandle {
  viewport?: {
    viewportElement?: HTMLElement | null
  } | null
}

const props = defineProps<{
  class?: HTMLAttributes['class']
  modelValue?: string
  options: { label: string, value: string }[]
  placeholder?: string
  searchPlaceholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

let open = $ref(false)
let searchQuery = $ref('')
let highlightedIndex = $ref(-1)
let hoveredIndex = $ref<number | undefined>(undefined)

const attrs = useAttrs()
const inputRef = $(useTemplateRef<HTMLInputElement>('inputRef'))
const listRef = $(useTemplateRef<HTMLElement>('listRef'))
const scrollAreaRef = $(useTemplateRef<ScrollAreaViewportHandle>('scrollAreaRef'))
const searchDocuments = $computed(() => createSearchOptionDocuments(props.options))

const filteredDocuments = $computed(() => {
  return filterSearchOptionDocuments(searchDocuments, searchQuery)
})

const selectedLabel = $computed(() => {
  if (!props.modelValue) {
    return ''
  }

  const selected = searchDocuments.find(option => option.value === props.modelValue)
  return selected?.label ?? props.modelValue
})

const activeHighlightedIndex = $computed(() => hoveredIndex ?? highlightedIndex)

function focusSearchInput() {
  inputRef?.focus()
  inputRef?.select()
}

function syncHighlightFromSelectedValue() {
  highlightedIndex = filteredDocuments.findIndex(option => option.value === props.modelValue)
}

function clearHoveredHighlight() {
  hoveredIndex = -1
}

function scrollHighlightedOptionIntoView(block: ScrollLogicalPosition = 'nearest') {
  const listElement = listRef
  if (!listElement) {
    return
  }

  const highlightedElement = listElement.querySelector('[role="option"][data-active-highlighted="true"]') as HTMLElement | null
  highlightedElement?.scrollIntoView({ block, behavior: 'auto' })
}

function scrollOptionsToTop() {
  const viewportElement = scrollAreaRef?.viewport?.viewportElement
  if (!viewportElement) {
    return
  }

  viewportElement.scrollTo({ top: 0, behavior: 'auto' })
}

async function scrollHighlightedOptionAfterNextTick(block: ScrollLogicalPosition) {
  await nextTick()
  requestAnimationFrame(() => {
    scrollHighlightedOptionIntoView(block)
  })
}

function selectOption(value: string) {
  emit('update:modelValue', value)
  open = false
}

async function handleInputKeydown(event: KeyboardEvent) {
  const currentIndex = activeHighlightedIndex

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (filteredDocuments.length === 0) {
      return
    }
    hoveredIndex = undefined
    highlightedIndex = currentIndex < 0
      ? 0
      : Math.min(currentIndex + 1, filteredDocuments.length - 1)
    await scrollHighlightedOptionAfterNextTick('nearest')
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (filteredDocuments.length === 0) {
      return
    }
    hoveredIndex = undefined
    highlightedIndex = currentIndex < 0
      ? filteredDocuments.length - 1
      : Math.max(currentIndex - 1, 0)
    await scrollHighlightedOptionAfterNextTick('nearest')
    return
  }

  if (event.key === 'Enter' && currentIndex >= 0) {
    event.preventDefault()
    selectOption(filteredDocuments[currentIndex]!.value)
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    open = false
  }
}

watch(() => filteredDocuments, (nextOptions) => {
  if (!open) {
    return
  }

  if (nextOptions.length === 0) {
    highlightedIndex = -1
    return
  }

  if (searchQuery.trim()) {
    highlightedIndex = -1
    return
  }

  syncHighlightFromSelectedValue()
})

watch(() => open, async (isOpen) => {
  if (!isOpen) {
    searchQuery = ''
    highlightedIndex = -1
    hoveredIndex = undefined
    return
  }

  searchQuery = ''
  hoveredIndex = undefined
  syncHighlightFromSelectedValue()
  await nextTick()
  focusSearchInput()
  requestAnimationFrame(() => {
    scrollHighlightedOptionIntoView('center')
  })
})

watch(() => searchQuery, async (nextQuery) => {
  if (!open || !nextQuery.trim()) {
    return
  }

  await nextTick()
  requestAnimationFrame(() => {
    scrollOptionsToTop()
  })
})
</script>

<template>
  <Popover ::open="open">
    <PopoverTrigger as-child>
      <Button
        v-bind="attrs"
        variant="outline"
        role="combobox"
        :aria-expanded="open"
        aria-haspopup="listbox"
        :class="cn('text-xs shadow-none justify-between font-normal px-2 py-1.5', props.class)"
      >
        <span class="truncate" :class="!selectedLabel && 'text-muted-foreground'">
          {{ selectedLabel || placeholder }}
        </span>
        <div class="i-lucide-chevrons-up-down ml-1 opacity-50 shrink-0 size-3" />
      </Button>
    </PopoverTrigger>
    <PopoverContent
      class="p-0 min-w-[--reka-popover-trigger-width] w-auto"
      @open-auto-focus.prevent
      @close-auto-focus.prevent
    >
      <div class="grid grid-rows-[auto_1fr]">
        <div class="px-2 border-b flex items-center">
          <Search aria-hidden="true" class="mr-2 opacity-50 shrink-0 h-4 w-4" />
          <input
            ref="inputRef"
            v-model="searchQuery"
            type="text"
            role="searchbox"
            :placeholder="searchPlaceholder"
            class="text-xs outline-none border-0 bg-transparent h-8 w-full"
            @keydown="handleInputKeydown"
          >
        </div>
        <ScrollArea ref="scrollAreaRef" class="max-h-40vh" type="auto">
          <div
            v-if="filteredDocuments.length === 0"
            role="status"
            class="text-sm text-muted-foreground px-2 py-6 text-center"
          >
            {{ searchQuery.trim() ? $t('common.noResults') : $t('common.noOptions') }}
          </div>
          <ul
            v-else
            ref="listRef"
            role="listbox"
            class="text-xs m-0 p-1 list-none"
            @mouseleave="clearHoveredHighlight"
          >
            <li
              v-for="(option, index) in filteredDocuments"
              :key="option.value"
              role="option"
              :aria-selected="props.modelValue === option.value"
              :data-active-highlighted="index === highlightedIndex ? 'true' : undefined"
              :class="cn(
                'flex cursor-pointer list-none items-center gap-2 rounded-sm px-2 py-1.5',
                index === activeHighlightedIndex && 'bg-muted',
                props.modelValue === option.value && 'font-medium',
              )"
              @mouseenter="hoveredIndex = index"
              @click="selectOption(option.value)"
            >
              <div class="i-lucide-check shrink-0 size-3.5" :class="props.modelValue === option.value ? 'opacity-100' : 'opacity-0'" />
              <span class="truncate">{{ option.label }}</span>
            </li>
          </ul>
        </ScrollArea>
      </div>
    </PopoverContent>
  </Popover>
</template>
