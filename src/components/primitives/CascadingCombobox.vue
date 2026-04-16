<script setup lang="ts">
import { Search } from '@lucide/vue'
import { ScrollAreaCorner, ScrollAreaRoot, ScrollAreaViewport } from 'reka-ui'

import { cn } from '~/lib/utils'

import { useCascadingComboboxState } from './combobox/useCascadingComboboxState'

import type { HTMLAttributes } from 'vue'
import type { CascadingComboboxNode, CascadingComboboxSearchDocument } from '~/lib/cascading-combobox'

defineOptions({
  inheritAttrs: false,
})

const props = defineProps<{
  browseNodes: CascadingComboboxNode[]
  class?: HTMLAttributes['class']
  modelValue?: string
  placeholder?: string
  searchDocuments: CascadingComboboxSearchDocument[]
  searchPlaceholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

let open = $ref(false)
let browseScrollRequestKey = $ref(0)
let browseScrollTargetDepth = $ref<number | 'all'>('all')
let hoveredSearchIndex = $ref<number | undefined>(undefined)
let searchHighlightedIndex = $ref(-1)
let searchQuery = $ref('')

const attrs = useAttrs()
const inputRef = $(useTemplateRef<HTMLInputElement>('inputRef'))
const panelRef = $(useTemplateRef<HTMLElement>('panelRef'))
const searchListboxId = useId()

const browseState = useCascadingComboboxState({
  browseNodes: () => props.browseNodes,
  modelValue: () => props.modelValue,
})
const expandedGroupPath = browseState.expandedGroupPath
const highlightedPath = browseState.highlightedPath

const isSearchMode = $computed(() => Boolean(searchQuery.trim()))
const activeSearchIndex = $computed(() => hoveredSearchIndex ?? searchHighlightedIndex)
const activeSearchResult = $computed(() => (
  activeSearchIndex >= 0 && activeSearchIndex < searchResults.length
    ? searchResults[activeSearchIndex]
    : undefined
))
const activeSearchOptionId = $computed(() => (
  activeSearchResult
    ? getSearchOptionId(activeSearchIndex)
    : undefined
))

const searchResults = $computed(() => {
  const keyword = searchQuery.trim().toLowerCase()
  if (!keyword) {
    return props.searchDocuments
  }

  return props.searchDocuments.filter(document => matchesSearchDocument(document, keyword))
})

const selectedLabel = $computed(() => {
  if (!props.modelValue) {
    return ''
  }

  const selectedDocument = props.searchDocuments.find(document => document.value === props.modelValue)
  return selectedDocument?.rawLabel ?? props.modelValue
})

function matchesSearchDocument(document: CascadingComboboxSearchDocument, keyword: string): boolean {
  return document.pathText.toLowerCase().includes(keyword)
    || document.value.toLowerCase().includes(keyword)
}

function getSearchOptionId(index: number): string {
  return `${searchListboxId}-option-${index}`
}

function focusSearchInput() {
  inputRef?.focus()
  inputRef?.select()
}

function centerElementInScrollContainer(
  element: HTMLElement | null | undefined,
  scrollContainer: HTMLElement | null | undefined,
) {
  if (!element || !scrollContainer) {
    return
  }

  const elementRect = element.getBoundingClientRect()
  const containerRect = scrollContainer.getBoundingClientRect()
  const offsetWithinContainer = elementRect.top - containerRect.top
  const nextScrollTop = scrollContainer.scrollTop
    + offsetWithinContainer
    - (scrollContainer.clientHeight - elementRect.height) / 2

  scrollContainer.scrollTop = Math.max(0, nextScrollTop)
}

function scrollActiveSearchResultIntoView() {
  const panelElement = panelRef
  const activeElement = panelElement?.querySelector('[data-active-search="true"]') as HTMLElement | null
  const scrollContainer = panelElement?.querySelector('[data-cascading-search-scroll-viewport]') as HTMLElement | null
  centerElementInScrollContainer(activeElement, scrollContainer)
}

async function scrollActiveBrowseNodeAfterNextTick() {
  await requestBrowseScrollAfterNextTick(getHighlightedBrowseLayerDepth())
}

async function requestBrowseScrollAfterNextTick(targetDepth: number | 'all') {
  await nextTick()
  requestAnimationFrame(() => {
    browseScrollTargetDepth = targetDepth
    browseScrollRequestKey++
  })
}

function getHighlightedBrowseLayerDepth(): number {
  return Math.max(0, highlightedPath.value.length - 1)
}

async function scrollActiveSearchResultAfterNextTick() {
  await nextTick()
  requestAnimationFrame(() => {
    scrollActiveSearchResultIntoView()
  })
}

function clearSearchHover() {
  hoveredSearchIndex = undefined
}

function handleRootInteractOutside(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLElement)) {
    return
  }

  if (target.closest('[data-cascading-subpanel]')) {
    event.preventDefault()
  }
}

function selectOption(value: string) {
  emit('update:modelValue', value)
  open = false
}

async function moveSearchHighlight(step: 1 | -1) {
  if (searchResults.length === 0) {
    return
  }

  hoveredSearchIndex = undefined
  searchHighlightedIndex = searchHighlightedIndex < 0
    ? (step > 0 ? 0 : searchResults.length - 1)
    : Math.min(Math.max(searchHighlightedIndex + step, 0), searchResults.length - 1)

  await scrollActiveSearchResultAfterNextTick()
}

function handleHighlightedNodeChange(nodeId: string) {
  browseState.setHighlightedNode(nodeId)
}

function handleGroupPreview(nodeId: string) {
  browseState.previewGroup(nodeId)
}

function handleGroupExpand(nodeId: string) {
  const scrollTargetDepth = browseState.expandGroup(nodeId)
  if (scrollTargetDepth !== undefined) {
    void requestBrowseScrollAfterNextTick(scrollTargetDepth)
  }
}

function handleGroupEnter(nodeId: string) {
  browseState.enterGroup(nodeId)
  void scrollActiveBrowseNodeAfterNextTick()
}

async function scrollKeyboardBrowseStateAfterNextTick() {
  const record = browseState.getNodeRecord()
  if (record?.node.kind === 'group') {
    await requestBrowseScrollAfterNextTick('all')
    return
  }

  await scrollActiveBrowseNodeAfterNextTick()
}

async function handleInputKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    open = false
    return
  }

  if (isSearchMode) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      await moveSearchHighlight(1)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      await moveSearchHighlight(-1)
      return
    }

    if (event.key === 'Enter') {
      const result = activeSearchResult
      if (!result) {
        return
      }

      event.preventDefault()
      selectOption(result.value)
    }
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    browseState.moveDown()
    const record = browseState.getNodeRecord()
    if (record?.node.kind === 'group') {
      browseState.focusGroup(record.node.id)
    }
    await scrollKeyboardBrowseStateAfterNextTick()
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    browseState.moveUp()
    const record = browseState.getNodeRecord()
    if (record?.node.kind === 'group') {
      browseState.focusGroup(record.node.id)
    }
    await scrollKeyboardBrowseStateAfterNextTick()
    return
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault()
    browseState.moveRight()
    await scrollActiveBrowseNodeAfterNextTick()
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()

    const result = browseState.enterHighlighted()

    if (result.kind === 'select-item' && result.value) {
      selectOption(result.value)
      return
    }

    if (result.kind === 'open-group') {
      await scrollActiveBrowseNodeAfterNextTick()
    }
    return
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    browseState.moveLeft()
    await scrollKeyboardBrowseStateAfterNextTick()
  }
}

watch(() => open, async (isOpen) => {
  if (!isOpen) {
    searchQuery = ''
    searchHighlightedIndex = -1
    hoveredSearchIndex = undefined
    return
  }

  searchQuery = ''
  searchHighlightedIndex = -1
  hoveredSearchIndex = undefined
  browseState.restoreSelectionPath(props.modelValue)
  await nextTick()
  focusSearchInput()
  requestAnimationFrame(() => {
    browseScrollTargetDepth = 'all'
    browseScrollRequestKey++
  })
})

watch(() => searchQuery, (nextQuery, previousQuery) => {
  const hadSearch = Boolean(previousQuery?.trim())
  const hasSearch = Boolean(nextQuery.trim())

  if (hasSearch && !hadSearch) {
    browseState.suspendBrowseForSearch()
  }

  if (!hasSearch && hadSearch) {
    browseState.resumeBrowseAfterSearch()
  }

  if (hasSearch || hadSearch) {
    searchHighlightedIndex = -1
    hoveredSearchIndex = undefined
  }
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
      class="p-0 min-w-[var(--reka-popover-trigger-width)] w-auto"
      @open-auto-focus.prevent
      @close-auto-focus.prevent
      @interact-outside="handleRootInteractOutside"
    >
      <div
        ref="panelRef"
        data-cascading-root-panel=""
        data-layer-depth="0"
        class="grid grid-rows-[auto_1fr]"
      >
        <div class="px-2 border-b flex items-center">
          <Search aria-hidden="true" class="mr-2 opacity-50 shrink-0 h-4 w-4" />
          <input
            ref="inputRef"
            v-model="searchQuery"
            :aria-activedescendant="isSearchMode ? activeSearchOptionId : undefined"
            :aria-controls="isSearchMode ? searchListboxId : undefined"
            type="text"
            role="searchbox"
            :placeholder="searchPlaceholder"
            class="text-xs outline-none border-0 bg-transparent h-8 w-full"
            @keydown="handleInputKeydown"
          >
        </div>

        <ScrollAreaRoot
          v-if="!isSearchMode"
          type="auto"
          class="w-full relative overflow-hidden"
        >
          <ScrollAreaViewport
            data-cascading-root-scroll-viewport=""
            class="rounded-[inherit] w-full"
            :style="{ maxHeight: '40vh' }"
          >
            <div class="p-1 min-w-[var(--reka-popover-trigger-width)] w-full">
              <CascadingBrowseLayer
                :nodes="props.browseNodes"
                :menu-open="open"
                :model-value="props.modelValue"
                :scroll-request-key="browseScrollRequestKey"
                :scroll-request-target-depth="browseScrollTargetDepth"
                :highlighted-path="highlightedPath"
                :expanded-group-path="expandedGroupPath"
                @expand-group="handleGroupExpand"
                @highlight-node="handleHighlightedNodeChange"
                @preview-group="handleGroupPreview"
                @enter-group="handleGroupEnter"
                @select-item="selectOption"
              />
            </div>
          </ScrollAreaViewport>
          <ScrollBar />
          <ScrollAreaCorner />
        </ScrollAreaRoot>

        <ScrollAreaRoot
          v-else
          type="auto"
          class="relative overflow-hidden"
        >
          <ScrollAreaViewport
            data-cascading-search-scroll-viewport=""
            class="rounded-[inherit] w-full"
            :style="{ maxHeight: '40vh' }"
          >
            <ul
              :id="searchListboxId"
              role="listbox"
              class="text-xs m-0 p-1 list-none"
              @mouseleave="clearSearchHover"
            >
              <li
                v-for="(result, index) in searchResults"
                :id="getSearchOptionId(index)"
                :key="result.value"
                role="option"
                :aria-selected="props.modelValue === result.value"
                :data-active-search="index === activeSearchIndex ? 'true' : undefined"
                :class="cn(
                  'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5',
                  index === activeSearchIndex && 'bg-muted',
                  props.modelValue === result.value && 'font-medium',
                )"
                @mouseenter="hoveredSearchIndex = index"
                @click="selectOption(result.value)"
              >
                <div class="i-lucide-check shrink-0 size-3.5" :class="props.modelValue === result.value ? 'opacity-100' : 'opacity-0'" />
                <span class="truncate">{{ result.rawLabel }}</span>
              </li>
              <li
                v-if="searchResults.length === 0"
                class="text-sm text-muted-foreground px-2 py-6 text-center"
              >
                {{ $t('edit.visualEditor.noResults') }}
              </li>
            </ul>
          </ScrollAreaViewport>
          <ScrollBar />
          <ScrollAreaCorner />
        </ScrollAreaRoot>
      </div>
    </PopoverContent>
  </Popover>
</template>
