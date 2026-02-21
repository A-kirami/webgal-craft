<script setup lang="ts">
import { join, normalize } from '@tauri-apps/api/path'
import { exists, stat } from '@tauri-apps/plugin-fs'
import { ArrowDown, ArrowUp, EllipsisVertical, LayoutGrid, LayoutList, Trash2, X } from 'lucide-vue-next'

import { cn } from '~/lib/utils'

import type { HTMLAttributes } from 'vue'

interface FilePickerProps {
  class?: HTMLAttributes['class']
  rootPath: string
  extensions?: string[]
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

interface InputParseResult {
  directoryPath: string
  keyword: string
  shouldNavigate: boolean
  rejectAbsolutePath: boolean
}

type BlurCommitSource = 'input' | 'popover'

const ZOOM_MAP: Record<ZoomLevel, number> = { small: 80, medium: 100, large: 120, extraLarge: 140 }
const HISTORY_STORAGE_KEY = 'webgalcraft:file-picker-history'

const {
  class: inputClass,
  rootPath,
  extensions = [],
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

let historyStore = $(useStorage<Record<string, string[]>>(HISTORY_STORAGE_KEY, {}))
let recentHistory = $ref<string[]>([])
let recentHistoryInvalidMap = $ref<Record<string, boolean>>({})
let isOpen = $ref(false)
let currentDir = $ref('')
let inputText = $ref('')
let filterKeyword = $ref('')
let items = $ref<FileViewerItem[]>([])
let isLoading = $ref(false)
let errorMsg = $ref('')
let isRootReady = $ref(false)
let isInputFocused = $ref(false)
let isPopoverFocused = $ref(false)
let suppressBlurCommit = $ref(false)
let skipInputWatch = $ref(false)
let canonicalRootPath = $ref('')
let latestReadId = 0
let latestRootId = 0

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

let recentChipRefs = $ref<Record<number, HTMLButtonElement>>({})

const hasHeader = $computed(() => !!slots['popover-header'] || !!popoverTitle)
const zoomPercent = $computed(() => ZOOM_MAP[zoomLevel])
const normalizedHistoryScopeKey = $computed(() => historyScopeKey.trim() || 'default')
const historyStorageKey = $computed(() =>
  canonicalRootPath ? `${normalizeComparablePath(canonicalRootPath)}::${normalizedHistoryScopeKey}` : '',
)
const extensionSet = $computed(() => new Set(
  extensions
    .map(ext => ext.trim().toLocaleLowerCase())
    .filter(Boolean)
    .map(ext => ext.startsWith('.') ? ext : `.${ext}`),
))
const filteredItems = $computed(() => {
  const keyword = filterKeyword.trim().toLocaleLowerCase()
  return items
    .map(item => ({ ...item, isSupported: item.isDir || isExtensionSupported(item.name) }))
    .filter((item) => {
      if (showSupportedOnly && item.isSupported === false) {
        return false
      }
      if (!keyword) {
        return true
      }
      return item.name.toLocaleLowerCase().startsWith(keyword)
    })
})
const visibleHistory = $computed(() => showRecentHistory ? recentHistory : [])
const canOpen = $computed(() => !disabled && isRootReady && !!canonicalRootPath)

const debouncedSync = useDebounceFn((input: string, previousInput: string) => {
  if (!isOpen || !canonicalRootPath) {
    return
  }
  void syncByInput(input, previousInput)
}, 300)

watch(
  () => rootPath,
  () => {
    void checkRoot()
  },
  { immediate: true },
)
watch(() => historyStorageKey, syncRecentHistory, { immediate: true })
watch(
  () => modelValue,
  (value) => {
    const normalized = normalizeRelativePath(value)
    if (value !== normalized) {
      modelValue = normalized
      return
    }
    const displayValue = isOpen && normalized && normalized === currentDir
      ? `${normalized}/`
      : normalized
    setInputSilently(displayValue)
  },
  { immediate: true },
)
watch(() => inputText, (value, previousValue) => {
  if (skipInputWatch) {
    return
  }
  debouncedSync(value, previousValue ?? '')
})
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

function normalizeComparablePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/\/+$/, '').toLocaleLowerCase()
}

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

function normalizeRelativePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+$/, '')
}

function normalizeInputPath(path: string): string {
  return path.trim().replaceAll('\\', '/')
}

function isAbsoluteInput(path: string): boolean {
  const trimmed = path.trim()
  return trimmed.startsWith('/')
    || trimmed.startsWith('\\')
    || trimmed.startsWith('\\\\')
    || /^[a-zA-Z]:[\\/]/.test(trimmed)
}

function getFileExt(name: string): string {
  const match = /\.[^./\\]+$/.exec(name)
  return match ? match[0].toLocaleLowerCase() : ''
}

function isExtensionSupported(name: string): boolean {
  if (extensionSet.size === 0) {
    return true
  }
  const ext = getFileExt(name)
  return !!ext && extensionSet.has(ext)
}

function parseInput(input: string, fallbackDir: string): InputParseResult {
  const normalized = normalizeInputPath(input)
  if (!normalized) {
    return { directoryPath: '', keyword: '', shouldNavigate: true, rejectAbsolutePath: false }
  }
  if (isAbsoluteInput(input)) {
    return { directoryPath: fallbackDir, keyword: '', shouldNavigate: false, rejectAbsolutePath: true }
  }
  if (!normalized.includes('/')) {
    return { directoryPath: fallbackDir, keyword: normalized, shouldNavigate: false, rejectAbsolutePath: false }
  }
  if (normalized.endsWith('/')) {
    return { directoryPath: normalizeRelativePath(normalized), keyword: '', shouldNavigate: true, rejectAbsolutePath: false }
  }
  const splitIndex = normalized.lastIndexOf('/')
  return {
    directoryPath: normalizeRelativePath(splitIndex === -1 ? '' : normalized.slice(0, splitIndex)),
    keyword: splitIndex === -1 ? normalized : normalized.slice(splitIndex + 1),
    shouldNavigate: true,
    rejectAbsolutePath: false,
  }
}

function toRelativeFromAbsolute(path: string): string {
  const root = canonicalRootPath.replaceAll('\\', '/')
  const target = path.replaceAll('\\', '/')
  if (target.toLocaleLowerCase().startsWith(root.toLocaleLowerCase())) {
    return normalizeRelativePath(target.slice(root.length))
  }
  return normalizeRelativePath(path)
}

function getParentPath(path: string): string {
  const normalized = normalizeRelativePath(path)
  const idx = normalized.lastIndexOf('/')
  return idx === -1 ? '' : normalized.slice(0, idx)
}

function getFileName(path: string): string {
  const normalized = normalizeRelativePath(path)
  return normalized.split('/').at(-1) ?? normalized
}

function resolveInputCandidatePath(input: string, fallbackDir: string): string {
  if (!input.trim() || isAbsoluteInput(input)) {
    return ''
  }
  const normalized = normalizeInputPath(input)
  if (!normalized) {
    return ''
  }
  if (normalized.includes('/')) {
    if (normalized.endsWith('/')) {
      return ''
    }
    return normalizeRelativePath(normalized)
  }
  return normalizeRelativePath(fallbackDir ? `${fallbackDir}/${normalized}` : normalized)
}

function resolveInputFallbackDir(input: string, previousInput: string, fallbackDir: string): string {
  const normalizedFallbackDir = normalizeRelativePath(fallbackDir)
  if (!normalizedFallbackDir) {
    return normalizedFallbackDir
  }

  const normalizedInput = normalizeInputPath(input)
  if (!normalizedInput || normalizedInput.includes('/')) {
    return normalizedFallbackDir
  }

  const normalizedPreviousInput = normalizeInputPath(previousInput)
  const currentDirName = getFileName(normalizedFallbackDir)
  if (normalizedPreviousInput === `${normalizedFallbackDir}/` && normalizedInput === currentDirName) {
    return getParentPath(normalizedFallbackDir)
  }

  return normalizedFallbackDir
}

async function checkRoot() {
  const requestId = ++latestRootId
  isRootReady = false
  canonicalRootPath = ''

  try {
    const normalizedRoot = await normalize(rootPath)
    if (!(await exists(normalizedRoot))) {
      isOpen = false
      return
    }
    const info = await stat(normalizedRoot)
    if (!info.isDirectory) {
      isOpen = false
      return
    }
    if (requestId !== latestRootId) {
      return
    }
    isRootReady = true
    canonicalRootPath = normalizedRoot
    syncRecentHistory()
    if (isOpen) {
      await loadDirectory('', '')
    }
  } catch {
    if (requestId !== latestRootId) {
      return
    }
    isOpen = false
  }
}

function syncRecentHistory() {
  recentHistory = historyStorageKey ? historyStore[historyStorageKey] ?? [] : []
  void refreshRecentHistoryInvalidState()
}

function updateRecentHistory(relativePath: string) {
  if (!historyStorageKey) {
    return
  }
  const normalizedPath = normalizeRelativePath(relativePath)
  if (!normalizedPath) {
    return
  }
  const next = [normalizedPath, ...recentHistory.filter(item => item !== normalizedPath)].slice(0, 20)
  historyStore = { ...historyStore, [historyStorageKey]: next }
  recentHistory = next
}

function clearRecentHistory() {
  if (!historyStorageKey) {
    return
  }
  historyStore = { ...historyStore, [historyStorageKey]: [] }
  recentHistory = []
  recentHistoryInvalidMap = {}
}

function isRecentHistoryInvalid(path: string): boolean {
  return recentHistoryInvalidMap[path] === true
}

async function refreshRecentHistoryInvalidState() {
  if (!canonicalRootPath || recentHistory.length === 0) {
    recentHistoryInvalidMap = {}
    return
  }

  const results = await Promise.all(
    recentHistory.map(async (path) => {
      try {
        const safePath = await ensurePathWithinRoot(await join(canonicalRootPath, path), canonicalRootPath)
        return [path, !(await exists(safePath))] as const
      } catch {
        return [path, true] as const
      }
    }),
  )

  recentHistoryInvalidMap = Object.fromEntries(results)
}

async function loadDirectory(relativeDir: string, keyword: string) {
  if (!canonicalRootPath) {
    return
  }
  const normalizedDir = normalizeRelativePath(relativeDir)
  const requestId = ++latestReadId
  isLoading = true
  errorMsg = ''

  try {
    const targetPath = await join(canonicalRootPath, normalizedDir)
    const result = await readDirectory(targetPath, { rootPath: canonicalRootPath, requestId })
    if (result.requestId !== latestReadId) {
      return
    }
    items = result.items
    currentDir = normalizedDir
    filterKeyword = keyword.trim()
  } catch (error) {
    if (requestId !== latestReadId) {
      return
    }
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage.includes('目录不存在')) {
      return
    }
    errorMsg = errorMessage
  } finally {
    if (requestId === latestReadId) {
      isLoading = false
    }
  }
}

async function syncByInput(input: string, previousInput: string) {
  const fallbackDir = resolveInputFallbackDir(input, previousInput, currentDir)
  const parsed = parseInput(input, fallbackDir)
  if (parsed.rejectAbsolutePath) {
    return
  }

  if (!parsed.shouldNavigate) {
    const targetDir = normalizeRelativePath(parsed.directoryPath)
    if (targetDir !== currentDir) {
      await loadDirectory(targetDir, parsed.keyword)
      return
    }
    filterKeyword = parsed.keyword.trim()
    return
  }
  await loadDirectory(parsed.directoryPath, parsed.keyword)
}

function setInputSilently(value: string) {
  skipInputWatch = true
  inputText = value
  nextTick(() => {
    skipInputWatch = false
  })
}

async function resolveOpenDir(): Promise<string> {
  if (!reopenInSelectedParent || !modelValue || !canonicalRootPath) {
    return ''
  }

  try {
    const safePath = await ensurePathWithinRoot(await join(canonicalRootPath, modelValue), canonicalRootPath)
    if (!(await exists(safePath))) {
      return ''
    }
    const info = await stat(safePath)
    return info.isDirectory ? normalizeRelativePath(modelValue) : getParentPath(modelValue)
  } catch {
    return ''
  }
}

async function openPopover() {
  if (!canOpen) {
    return
  }
  isOpen = true
  setInputSilently(modelValue)

  const openDir = await resolveOpenDir()
  await loadDirectory(openDir, '')
  void refreshRecentHistoryInvalidState()
}

function handlePopoverOpenChange(nextOpen: boolean) {
  if (nextOpen) {
    if (!isOpen) {
      void openPopover()
    }
    return
  }
  isOpen = false
  isPopoverFocused = false
  scheduleBlurCommit('popover')
}

function commitSelection(relativePath: string, closePopover: boolean) {
  const normalizedPath = normalizeRelativePath(relativePath)
  modelValue = normalizedPath
  setInputSilently(normalizedPath)
  updateRecentHistory(normalizedPath)
  if (closePopover) {
    isOpen = false
  }
}

function handleSelectItem(item: FileViewerItem) {
  commitSelection(toRelativeFromAbsolute(item.path), true)
}

async function handleNavigateItem(item: FileViewerItem) {
  const relativeDir = toRelativeFromAbsolute(item.path)
  setInputSilently(relativeDir ? `${relativeDir}/` : '')
  await loadDirectory(relativeDir, '')
}

function handleBreadcrumbNavigate(path: string) {
  const normalizedDir = normalizeRelativePath(path)
  setInputSilently(normalizedDir ? `${normalizedDir}/` : '')
  void loadDirectory(normalizedDir, '')
}

function handleInputFocus() {
  isInputFocused = true
  if (!isOpen) {
    void openPopover()
  }
}

function scheduleBlurCommit(source: BlurCommitSource) {
  setTimeout(() => {
    if (source === 'input' && isOpen) {
      return
    }
    if (isInputFocused || isPopoverFocused) {
      return
    }
    if (suppressBlurCommit) {
      suppressBlurCommit = false
      return
    }
    modelValue = normalizeRelativePath(inputText)
  }, 0)
}

function handleInputBlur() {
  isInputFocused = false
  scheduleBlurCommit('input')
}

function handleInputClick() {
  if (!isOpen) {
    void openPopover()
  }
}

async function handleEnter() {
  if (!canonicalRootPath) {
    return
  }
  const candidatePath = resolveInputCandidatePath(inputText, currentDir)
  if (!candidatePath) {
    return
  }

  try {
    const safePath = await ensurePathWithinRoot(await join(canonicalRootPath, candidatePath), canonicalRootPath)
    if (!(await exists(safePath))) {
      return
    }

    const info = await stat(safePath)
    if (info.isDirectory) {
      await loadDirectory(candidatePath, '')
      setInputSilently(candidatePath ? `${candidatePath}/` : '')
      return
    }
    commitSelection(candidatePath, true)
  } catch {
    return
  }
}

function handleEscape() {
  suppressBlurCommit = true
  setInputSilently(modelValue)
  isOpen = false
}

function handleInputKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    void handleEnter()
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    handleEscape()
  }
}

function handleClear(event: MouseEvent) {
  event.stopPropagation()
  event.preventDefault()
  modelValue = ''
  setInputSilently('')
}

function handlePopoverFocusIn() {
  isPopoverFocused = true
}

function handlePopoverFocusOut(event: FocusEvent) {
  const currentTarget = event.currentTarget as HTMLElement | null
  const nextFocusTarget = event.relatedTarget as Node | null
  if (currentTarget?.contains(nextFocusTarget)) {
    return
  }
  isPopoverFocused = false
}

function handlePopoverOpenAutoFocus(event: Event) {
  event.preventDefault()
}

async function handleHistorySelect(path: string) {
  if (!canonicalRootPath) {
    return
  }
  if (isRecentHistoryInvalid(path)) {
    return
  }
  try {
    const safePath = await ensurePathWithinRoot(await join(canonicalRootPath, path), canonicalRootPath)
    if (!(await exists(safePath))) {
      return
    }
    commitSelection(path, true)
  } catch {
    return
  }
}

function setRecentChipRef(index: number, element: Element | null) {
  if (element instanceof HTMLButtonElement) {
    recentChipRefs[index] = element
    return
  }
  delete recentChipRefs[index]
}

function focusRecentChip(index: number) {
  const button = recentChipRefs[index]
  if (!button) {
    return
  }
  button.focus()
  button.scrollIntoView({ block: 'nearest' })
}

function handleRecentChipKeydown(event: KeyboardEvent, index: number) {
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    focusRecentChip(Math.max(0, index - 1))
    return
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    focusRecentChip(Math.min(visibleHistory.length - 1, index + 1))
  }
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
  <div class="w-full">
    <Popover :open="isOpen" @update:open="handlePopoverOpenChange">
      <PopoverTrigger as-child>
        <div class="relative">
          <Input
            ::="inputText"
            :disabled="disabled"
            :placeholder="placeholder || $t('filePicker.placeholder')"
            :class="cn(
              {
                'pr-8': !!inputText,
              },
              inputClass,
            )"
            @focus="handleInputFocus"
            @blur="handleInputBlur"
            @click.stop="handleInputClick"
            @keydown="handleInputKeydown"
          />
          <button
            v-if="inputText"
            type="button"
            class="text-muted-foreground size-4 right-2 top-1/2 absolute hover:text-foreground -translate-y-1/2"
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
        class="p-0 flex flex-col h-[min(64vh,496px)] w-[min(46vw,430px)]"
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

        <div class="px-2 py-1.5 border-b flex gap-1.5 min-w-0 items-center">
          <PathBreadcrumb
            class="ml-1 flex-1 min-w-0"
            :root-path="rootPath"
            :current-path="currentDir"
            @navigate="handleBreadcrumbNavigate"
          />
          <Button
            variant="outline"
            size="icon"
            class="size-7 hidden shadow-none sm:inline-flex"
            :title="viewMode === 'grid' ? $t('common.view.grid') : $t('common.view.list')"
            :aria-label="viewMode === 'grid' ? $t('common.view.grid') : $t('common.view.list')"
            @click="viewMode = viewMode === 'grid' ? 'list' : 'grid'"
          >
            <LayoutGrid v-if="viewMode === 'grid'" class="size-3.5" />
            <LayoutList v-else class="size-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="outline" size="icon" class="size-7 shadow-none" :title="$t('filePicker.more.title')" :aria-label="$t('filePicker.more.title')">
                <EllipsisVertical class="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-30">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger class="text-xs">
                  {{ $t('filePicker.more.sortTitle') }}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuLabel class="text-xs">
                    {{ $t('filePicker.more.sortFieldTitle') }}
                  </DropdownMenuLabel>
                  <DropdownMenuRadioGroup ::="sortBy">
                    <DropdownMenuRadioItem value="name" class="text-xs">
                      {{ $t('filePicker.sort.name') }}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="modifiedTime" class="text-xs">
                      {{ $t('filePicker.sort.modifiedTime') }}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="createdTime" class="text-xs">
                      {{ $t('filePicker.sort.createdTime') }}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="size" class="text-xs">
                      {{ $t('filePicker.sort.size') }}
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel class="text-xs">
                    {{ $t('filePicker.more.sortOrderTitle') }}
                  </DropdownMenuLabel>
                  <DropdownMenuRadioGroup ::="sortOrder">
                    <DropdownMenuRadioItem value="asc" class="text-xs">
                      <span class="flex-1">{{ $t('filePicker.sort.directionAsc') }}</span>
                      <ArrowUp class="text-muted-foreground shrink-0 size-3.5" />
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="desc" class="text-xs">
                      <span class="flex-1">{{ $t('filePicker.sort.directionDesc') }}</span>
                      <ArrowDown class="text-muted-foreground shrink-0 size-3.5" />
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger class="text-xs">
                  {{ $t('filePicker.more.zoomTitle') }}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup ::="zoomLevel">
                    <DropdownMenuRadioItem value="small" class="text-xs">
                      {{ $t('filePicker.zoom.small') }}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="medium" class="text-xs">
                      {{ $t('filePicker.zoom.medium') }}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="large" class="text-xs">
                      {{ $t('filePicker.zoom.large') }}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="extraLarge" class="text-xs">
                      {{ $t('filePicker.zoom.extraLarge') }}
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger class="text-xs">
                  {{ $t('filePicker.more.filtersTitle') }}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuCheckboxItem ::="showSupportedOnly" class="text-xs">
                    <span class="flex-1">{{ $t('filePicker.more.showSupportedOnly') }}</span>
                  </DropdownMenuCheckboxItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger class="text-xs">
                  {{ $t('filePicker.more.recentTitle') }}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuCheckboxItem ::="showRecentHistory" class="text-xs">
                    <span class="flex-1">{{ $t('filePicker.more.showRecentHistory') }}</span>
                  </DropdownMenuCheckboxItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

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

        <div v-if="showRecentHistory && visibleHistory.length > 0" class="p-2 border-t flex flex-col">
          <div class="flex min-w-0 items-center justify-between">
            <div class="text-xs text-muted-foreground">
              {{ $t('filePicker.recent.title') }}
            </div>
            <Button
              variant="ghost"
              size="icon"
              class="text-muted-foreground shrink-0 size-6 hover:text-primary"
              :title="$t('filePicker.more.clearRecentHistory')"
              :aria-label="$t('filePicker.more.clearRecentHistory')"
              @click="clearRecentHistory"
            >
              <Trash2 class="size-3.5" />
            </Button>
          </div>
          <div class="py-1 max-h-[3.5rem] overflow-hidden">
            <div class="flex flex-wrap gap-1">
              <button
                v-for="(path, index) in visibleHistory"
                :key="path"
                :ref="element => setRecentChipRef(index, element as Element | null)"
                type="button"
                class="text-[11px] px-1.5 py-0.5 border rounded inline-flex gap-0.5 max-w-32 items-center focus-visible:outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
                :class="{ 'text-muted-foreground border-dashed': isRecentHistoryInvalid(path) }"
                :title="path"
                @click="handleHistorySelect(path)"
                @keydown="(event) => handleRecentChipKeydown(event, index)"
              >
                <span class="truncate">{{ getFileName(path) }}</span>
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  </div>
</template>
