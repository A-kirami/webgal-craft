<script setup lang="ts">
import { X } from 'lucide-vue-next'

import { useDirectoryReader } from '~/composables/useDirectoryReader'
import { useFilePickerController } from '~/features/file-picker/useFilePickerController'
import { useFilePickerHistory } from '~/features/file-picker/useFilePickerHistory'
import { cn } from '~/lib/utils'
import { usePreferenceStore } from '~/stores/preference'
import { FileViewerSortBy, FileViewerSortOrder } from '~/types/file-viewer'

import FilePickerRecentHistory from './FilePickerRecentHistory.vue'
import FilePickerToolbar from './FilePickerToolbar.vue'

import type { HTMLAttributes } from 'vue'

interface FilePickerProps {
  class?: HTMLAttributes['class']
  inputId?: string
  /** 仅用于控制输入框错误样式，校验逻辑由外部负责 */
  invalid?: boolean
  rootPath: string
  extensions?: string[]
  exclude?: string[]
  defaultSortBy?: FileViewerSortBy
  defaultSortOrder?: FileViewerSortOrder
  defaultZoomLevel?: 'small' | 'medium' | 'large' | 'extraLarge'
  defaultShowSupportedOnly?: boolean
  defaultShowRecentHistory?: boolean
  historyScopeKey?: string
  popoverTitle?: string
  placeholder?: string
  reopenInSelectedParent?: boolean
  disabled?: boolean
}

interface FilePickerSlots {
  'popover-header'?: () => unknown
}

type ViewMode = 'list' | 'grid'
type ZoomLevel = 'small' | 'medium' | 'large' | 'extraLarge'

const ZOOM_MAP: Record<ZoomLevel, number> = { small: 80, medium: 100, large: 120, extraLarge: 140 }

defineOptions({ inheritAttrs: false })

const {
  class: rootClass,
  inputId,
  invalid = false,
  rootPath,
  extensions = [],
  exclude = [],
  defaultSortBy = 'name',
  defaultSortOrder = 'asc',
  defaultZoomLevel = 'medium',
  defaultShowSupportedOnly = true,
  defaultShowRecentHistory = true,
  historyScopeKey = 'default',
  popoverTitle = '',
  placeholder = '',
  reopenInSelectedParent = false,
  disabled = false,
} = defineProps<FilePickerProps>()

defineSlots<FilePickerSlots>()

let modelValue = $(defineModel<string>({ default: '' }))

const slots = useSlots()
const preferenceStore = usePreferenceStore()
const { readDirectory, ensurePathWithinRoot } = useDirectoryReader()

const fileViewerRef = useTemplateRef<InstanceType<typeof FileViewer>>('fileViewerRef')
const fileListRef = useTemplateRef<HTMLElement>('fileListRef')

const canonicalRootPath = ref('')

let viewMode = $ref<ViewMode>(preferenceStore.filePickerViewMode ?? preferenceStore.assetViewMode)
let zoomLevel = $ref<ZoomLevel>(
  preferenceStore.filePickerZoomLevel
  ?? resolveZoomLevelFromAssetZoom(preferenceStore.assetZoom[0])
  ?? defaultZoomLevel,
)
let sortBy = $ref(defaultSortBy)
let sortOrder = $ref(defaultSortOrder)
let showSupportedOnly = $ref(defaultShowSupportedOnly)
let showRecentHistory = $ref(preferenceStore.filePickerShowRecentHistory ?? defaultShowRecentHistory)

const hasHeader = $computed(() => !!slots['popover-header'] || !!popoverTitle)
const zoomPercent = $computed(() => ZOOM_MAP[zoomLevel])
const {
  clearRecentHistory,
  historyStorageKey,
  isRecentHistoryInvalid,
  recentHistory,
  recentHistoryInvalidMap,
  refreshRecentHistoryInvalidState,
  removeRecentHistoryPaths,
  syncRecentHistory,
  updateRecentHistory,
} = $(useFilePickerHistory({
  canonicalRootPath: () => canonicalRootPath.value,
  ensurePathWithinRoot,
  historyScopeKey: () => historyScopeKey,
}))
const visibleHistory = $computed(() => showRecentHistory ? recentHistory : [])
const {
  currentDir,
  errorMsg,
  filteredItems,
  filterKeyword,
  handleBreadcrumbNavigate,
  handleClear,
  handleHistorySelect,
  handleInputBlur,
  handleInputClick,
  handleInputFocus,
  handleInputKeydown,
  handleNavigateItem,
  handlePopoverFocusIn,
  handlePopoverFocusOut,
  handlePopoverOpenAutoFocus,
  handlePopoverOpenChange,
  handleSelectItem,
  inputText,
  isLoading,
  isOpen,
} = $(useFilePickerController({
  canonicalRootPath,
  disabled: () => disabled,
  ensurePathWithinRoot,
  exclude: () => exclude,
  extensions: () => extensions,
  isRecentHistoryInvalid: path => isRecentHistoryInvalid(path),
  modelValue: () => modelValue,
  readDirectory,
  refreshRecentHistoryInvalidState,
  removeRecentHistoryPaths,
  reopenInSelectedParent: () => reopenInSelectedParent,
  rootPath: () => rootPath,
  setModelValue: (value) => {
    modelValue = value
  },
  showSupportedOnly: () => showSupportedOnly,
  syncRecentHistory,
  updateRecentHistory,
}))

watch(() => historyStorageKey, syncRecentHistory, { immediate: true })
watch(() => [currentDir, filterKeyword] as const, () => {
  fileViewerRef.value?.scrollToIndex(0)
})
watch(
  () => viewMode,
  (value) => {
    preferenceStore.filePickerViewMode = value
  },
)
watch(
  () => zoomLevel,
  (value) => {
    preferenceStore.filePickerZoomLevel = value
  },
)
watch(
  () => showRecentHistory,
  (value) => {
    preferenceStore.filePickerShowRecentHistory = value
  },
)
watch(
  () => recentHistory,
  () => {
    void refreshRecentHistoryInvalidState()
  },
)

function resolveZoomLevelFromAssetZoom(value: number | undefined): ZoomLevel | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }
  if (value <= 90) {
    return 'small'
  }
  if (value <= 110) {
    return 'medium'
  }
  if (value <= 130) {
    return 'large'
  }
  return 'extraLarge'
}

function collectFileButtons(): HTMLButtonElement[] {
  const container = fileListRef.value
  if (!container) {
    return []
  }
  return [...container.querySelectorAll<HTMLButtonElement>('[data-file-viewer-item="true"]')]
}

function handleFileListKeydown(event: KeyboardEvent) {
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
    return
  }
  const target = event.target as HTMLElement | null
  if (!target) {
    return
  }
  const buttons = collectFileButtons()
  if (buttons.length === 0) {
    return
  }
  const currentIndex = buttons.findIndex(button => button === target || button.contains(target))
  if (currentIndex === -1) {
    return
  }
  event.preventDefault()
  const delta = event.key === 'ArrowUp' ? -1 : 1
  const nextIndex = Math.min(Math.max(currentIndex + delta, 0), buttons.length - 1)
  const nextButton = buttons[nextIndex]
  nextButton?.focus()
  nextButton?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}
</script>

<template>
  <Popover :open="isOpen" @update:open="handlePopoverOpenChange">
    <PopoverTrigger as-child>
      <div :class="cn('relative', rootClass)">
        <Input
          :id="inputId"
          ::="inputText"
          :disabled="disabled"
          :placeholder="placeholder || $t('filePicker.placeholder')"
          :class="[
            inputText ? 'pr-7' : '',
            invalid ? 'text-destructive! bg-destructive/5 border-destructive/50 focus-visible:ring-destructive/30' : '',
          ]"
          @focus="handleInputFocus"
          @blur="handleInputBlur"
          @click.stop="handleInputClick"
          @keydown="handleInputKeydown"
        />
        <button
          v-if="inputText"
          type="button"
          class="size-4 right-2 top-1/2 absolute -translate-y-1/2"
          :class="invalid ? 'text-destructive/60 hover:text-destructive' : 'text-muted-foreground hover:text-foreground'"
          :aria-label="$t('filePicker.clearInput')"
          @click="handleClear"
        >
          <X class="size-4" />
        </button>
      </div>
    </PopoverTrigger>

    <PopoverContent
      align="start"
      :side-offset="8"
      :collision-padding="8"
      class="p-0 flex flex-col h-[min(64vh,496px)] max-h-[var(--reka-popover-content-available-height)] max-w-[var(--reka-popover-content-available-width)] w-[min(46vw,430px)]"
      @open-auto-focus="handlePopoverOpenAutoFocus"
      @focusin="handlePopoverFocusIn"
      @focusout="handlePopoverFocusOut"
    >
      <div v-if="hasHeader" class="px-3 py-2 border-b">
        <slot name="popover-header">
          <h3 class="text-sm font-medium">
            {{ popoverTitle }}
          </h3>
        </slot>
      </div>

      <FilePickerToolbar
        :root-path="rootPath"
        :current-dir="currentDir"
        :view-mode="viewMode"
        :sort-by="sortBy"
        :sort-order="sortOrder"
        :zoom-level="zoomLevel"
        :show-supported-only="showSupportedOnly"
        :show-recent-history="showRecentHistory"
        @navigate="handleBreadcrumbNavigate"
        @update-view-mode="viewMode = $event"
        @update-sort-by="sortBy = $event"
        @update-sort-order="sortOrder = $event"
        @update-zoom-level="zoomLevel = $event"
        @update-show-supported-only="showSupportedOnly = $event"
        @update-show-recent-history="showRecentHistory = $event"
      />

      <div ref="fileListRef" class="flex-1 min-h-0" @keydown="handleFileListKeydown">
        <FileViewer
          ref="fileViewerRef"
          :items="filteredItems"
          :view-mode="viewMode"
          :zoom="zoomPercent"
          :sortable-headers="false"
          :is-loading="isLoading"
          :error-msg="errorMsg"
          :sort-by="sortBy"
          :sort-order="sortOrder"
          @navigate="handleNavigateItem"
          @select="handleSelectItem"
        />
      </div>

      <FilePickerRecentHistory
        v-if="showRecentHistory && visibleHistory.length > 0"
        :items="visibleHistory"
        :invalid-map="recentHistoryInvalidMap"
        :title="$t('filePicker.recent.title')"
        :clear-label="$t('filePicker.more.clearRecentHistory')"
        @clear="clearRecentHistory"
        @select="handleHistorySelect"
      />
    </PopoverContent>
  </Popover>
</template>
