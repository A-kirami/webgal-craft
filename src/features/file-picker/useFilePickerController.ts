import { join, normalize } from '@tauri-apps/api/path'
import { exists, stat } from '@tauri-apps/plugin-fs'

import {
  formatFilePickerModelValueForInput,
  getFilePickerParentPath,
  parseFilePickerInput,
  resolveFilePickerInputFallbackDir,
} from '~/features/file-picker/file-picker'
import { AppError } from '~/types/errors'
import { normalizeRelativePath } from '~/utils/path'

import type { Ref } from 'vue'
import type { FileViewerItem } from '~/types/file-viewer'

type BlurCommitSource = 'input' | 'popover'

interface OpenPopoverOptions {
  syncInputWithModel?: boolean
}

interface UseFilePickerControllerOptions {
  canonicalRootPath?: Ref<string>
  disabled: () => boolean
  ensurePathWithinRoot: (path: string, rootPath: string) => Promise<string>
  exclude: () => string[]
  extensions: () => string[]
  isRecentHistoryInvalid: (path: string) => boolean
  modelValue: () => string
  readDirectory: (
    path: string,
    options: { rootPath: string, requestId: number },
  ) => Promise<{ items: FileViewerItem[], requestId: number }>
  refreshRecentHistoryInvalidState: () => Promise<void> | void
  removeRecentHistoryPaths: (paths: string[]) => void
  reopenInSelectedParent: () => boolean
  rootPath: () => string
  setModelValue: (value: string) => void
  showSupportedOnly: () => boolean
  syncRecentHistory: () => void
  updateRecentHistory: (path: string) => void
}

export function useFilePickerController(options: UseFilePickerControllerOptions) {
  const canonicalRootPath = options.canonicalRootPath ?? ref('')

  const extensionSet = computed(() => new Set(
    options.extensions()
      .map(ext => ext.trim().toLocaleLowerCase())
      .filter(Boolean)
      .map(ext => ext.startsWith('.') ? ext : `.${ext}`),
  ))
  const excludeSet = computed(() => new Set(
    options.exclude()
      .map(name => name.trim())
      .filter(Boolean)
      .map(name => name.toLowerCase()),
  ))

  const isOpen = ref(false)
  const currentDir = ref('')
  const inputText = ref('')
  const filterKeyword = ref('')
  const items = ref<FileViewerItem[]>([])
  const isLoading = ref(false)
  const errorMsg = ref('')
  const isRootReady = ref(false)
  const isInputFocused = ref(false)
  const isPopoverFocused = ref(false)
  const suppressBlurCommit = ref(false)
  const skipInputWatch = ref(false)
  let latestReadId = 0
  let latestRootId = 0

  const canOpen = computed(() => !options.disabled() && isRootReady.value && !!canonicalRootPath.value)
  const filteredItems = computed(() => {
    const keyword = filterKeyword.value.trim().toLocaleLowerCase()
    return items.value
      .map(item => ({ ...item, isSupported: item.isDir || isExtensionSupported(item.name) }))
      .filter((item) => {
        if (!item.isDir && excludeSet.value.size > 0 && excludeSet.value.has(item.name.toLowerCase())) {
          return false
        }
        if (options.showSupportedOnly() && item.isSupported === false) {
          return false
        }
        if (!keyword) {
          return true
        }
        return item.name.toLocaleLowerCase().startsWith(keyword)
      })
  })

  const debouncedSync = useDebounceFn(async (input: string, previousInput: string) => {
    if (!canonicalRootPath.value) {
      return
    }

    if (!isOpen.value) {
      if (isInputFocused.value && canOpen.value) {
        await openPopover({ syncInputWithModel: false })
        await syncByInput(input, previousInput)
      }
      return
    }

    await syncByInput(input, previousInput)
  }, 300)

  watch(
    () => options.rootPath(),
    () => {
      void checkRoot()
    },
    { immediate: true },
  )

  watch(
    () => options.modelValue(),
    (value) => {
      setInputSilently(formatFilePickerModelValueForInput(value, {
        currentDir: currentDir.value,
        isOpen: isOpen.value,
      }))
    },
    { immediate: true },
  )

  watch(() => inputText.value, (value, previousValue) => {
    if (skipInputWatch.value) {
      return
    }
    debouncedSync(value, previousValue ?? '')
  })

  function getFileExt(name: string): string {
    const match = /\.[^./\\]+$/.exec(name)
    return match ? match[0].toLocaleLowerCase() : ''
  }

  function isExtensionSupported(name: string): boolean {
    if (extensionSet.value.size === 0) {
      return true
    }
    const ext = getFileExt(name)
    return !!ext && extensionSet.value.has(ext)
  }

  function toRelativeFromAbsolute(path: string): string {
    // `checkRoot()` 保存的是经过 Tauri 规范化的绝对根路径，调用方传入的路径
    // 也来自同一套 Tauri 路径 API。这里保持精确比较，避免在大小写敏感文件系统上
    // 误把大小写不同的路径视为同一个根目录下的相对路径。
    const root = canonicalRootPath.value.replaceAll('\\', '/')
    const target = path.replaceAll('\\', '/')
    const rootPrefix = root.endsWith('/') ? root : `${root}/`
    if (target === root) {
      return ''
    }
    if (target.startsWith(rootPrefix)) {
      return normalizeRelativePath(target.slice(rootPrefix.length))
    }
    return normalizeRelativePath(path)
  }

  async function checkRoot() {
    const requestId = ++latestRootId
    isRootReady.value = false
    canonicalRootPath.value = ''

    try {
      const normalizedRoot = await normalize(options.rootPath())
      if (!(await exists(normalizedRoot))) {
        isOpen.value = false
        return
      }
      const info = await stat(normalizedRoot)
      if (!info.isDirectory) {
        isOpen.value = false
        return
      }
      if (requestId !== latestRootId) {
        return
      }
      isRootReady.value = true
      canonicalRootPath.value = normalizedRoot
      options.syncRecentHistory()
      if (isOpen.value) {
        await loadDirectory('', '')
      }
    } catch {
      if (requestId !== latestRootId) {
        return
      }
      isOpen.value = false
    }
  }

  async function loadDirectory(relativeDir: string, keyword: string) {
    if (!canonicalRootPath.value) {
      return
    }
    const normalizedDir = normalizeRelativePath(relativeDir)
    const requestId = ++latestReadId
    isLoading.value = true
    errorMsg.value = ''

    try {
      const targetPath = await join(canonicalRootPath.value, normalizedDir)
      const result = await options.readDirectory(targetPath, { rootPath: canonicalRootPath.value, requestId })
      if (result.requestId !== latestReadId) {
        return
      }
      items.value = result.items
      currentDir.value = normalizedDir
      filterKeyword.value = keyword.trim()
    } catch (error) {
      if (requestId !== latestReadId) {
        return
      }
      if (error instanceof AppError && error.code === 'DIR_NOT_FOUND') {
        errorMsg.value = error.message || '目录不存在'
        return
      }
      errorMsg.value = error instanceof Error ? error.message : String(error)
    } finally {
      if (requestId === latestReadId) {
        isLoading.value = false
      }
    }
  }

  async function syncByInput(input: string, previousInput: string) {
    const fallbackDir = resolveFilePickerInputFallbackDir(input, previousInput, currentDir.value)
    const parsed = parseFilePickerInput(input, fallbackDir)
    if (parsed.rejectAbsolutePath) {
      return
    }

    if (!parsed.shouldNavigate) {
      const targetDir = normalizeRelativePath(parsed.directoryPath)
      if (targetDir !== currentDir.value) {
        await loadDirectory(targetDir, parsed.keyword)
        return
      }
      filterKeyword.value = parsed.keyword.trim()
      return
    }
    await loadDirectory(parsed.directoryPath, parsed.keyword)
  }

  function setInputSilently(value: string) {
    skipInputWatch.value = true
    inputText.value = value
    nextTick(() => {
      skipInputWatch.value = false
    })
  }

  async function resolveOpenDir(): Promise<string> {
    if (!options.reopenInSelectedParent() || !options.modelValue() || !canonicalRootPath.value) {
      return ''
    }

    try {
      const safePath = await options.ensurePathWithinRoot(await join(canonicalRootPath.value, options.modelValue()), canonicalRootPath.value)
      if (!(await exists(safePath))) {
        return ''
      }
      const info = await stat(safePath)
      return info.isDirectory
        ? normalizeRelativePath(options.modelValue())
        : getFilePickerParentPath(options.modelValue())
    } catch {
      return ''
    }
  }

  async function openPopover(openOptions: OpenPopoverOptions = {}) {
    if (!canOpen.value) {
      return
    }
    const syncInputWithModel = openOptions.syncInputWithModel ?? true
    isOpen.value = true
    if (syncInputWithModel) {
      setInputSilently(options.modelValue())
    }

    const openDir = await resolveOpenDir()
    await loadDirectory(openDir, '')
    void options.refreshRecentHistoryInvalidState()
  }

  function handlePopoverOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      if (!isOpen.value) {
        void openPopover()
      }
      return
    }
    isOpen.value = false
    isPopoverFocused.value = false
    scheduleBlurCommit('popover')
  }

  function commitSelection(relativePath: string, closePopover: boolean) {
    const normalizedPath = normalizeRelativePath(relativePath)
    options.setModelValue(normalizedPath)
    setInputSilently(normalizedPath)
    options.updateRecentHistory(normalizedPath)
    if (closePopover) {
      isOpen.value = false
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
    isInputFocused.value = true
    if (!isOpen.value) {
      void openPopover()
    }
  }

  function commitInputValue() {
    const normalizedPath = normalizeRelativePath(inputText.value)
    options.setModelValue(normalizedPath)
    setInputSilently(normalizedPath)
  }

  function scheduleBlurCommit(source: BlurCommitSource) {
    setTimeout(() => {
      if (source === 'input' && isOpen.value) {
        return
      }
      if (isInputFocused.value || isPopoverFocused.value) {
        return
      }
      if (suppressBlurCommit.value) {
        suppressBlurCommit.value = false
        return
      }
      commitInputValue()
    }, 0)
  }

  function handleInputBlur() {
    isInputFocused.value = false
    scheduleBlurCommit('input')
  }

  function handleInputClick() {
    if (!isOpen.value) {
      void openPopover()
    }
  }

  function handleEnter() {
    commitInputValue()
    isOpen.value = false
  }

  function handleEscape() {
    suppressBlurCommit.value = true
    setInputSilently(options.modelValue())
    isOpen.value = false
  }

  function handleInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleEnter()
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
    options.setModelValue('')
    setInputSilently('')
  }

  function handlePopoverFocusIn() {
    isPopoverFocused.value = true
  }

  function handlePopoverFocusOut(event: FocusEvent) {
    const currentTarget = event.currentTarget as HTMLElement | null
    const nextFocusTarget = event.relatedTarget as Node | null
    if (currentTarget?.contains(nextFocusTarget)) {
      return
    }
    isPopoverFocused.value = false
  }

  function handlePopoverOpenAutoFocus(event: Event) {
    event.preventDefault()
  }

  async function handleHistorySelect(path: string) {
    if (!canonicalRootPath.value) {
      return
    }
    if (options.isRecentHistoryInvalid(path)) {
      options.removeRecentHistoryPaths([path])
      return
    }
    try {
      const safePath = await options.ensurePathWithinRoot(await join(canonicalRootPath.value, path), canonicalRootPath.value)
      if (!(await exists(safePath))) {
        options.removeRecentHistoryPaths([path])
        return
      }
      commitSelection(path, true)
    } catch (error) {
      if (error instanceof AppError && error.code === 'PATH_TRAVERSAL') {
        options.removeRecentHistoryPaths([path])
      }
    }
  }

  return {
    canOpen,
    canonicalRootPath,
    checkRoot,
    currentDir,
    errorMsg,
    filteredItems,
    filterKeyword,
    handleBreadcrumbNavigate,
    handleClear,
    handleEnter,
    handleEscape,
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
    openPopover,
  }
}
