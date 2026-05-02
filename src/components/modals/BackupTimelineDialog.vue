<script setup lang="ts">
import { Clock, History, RotateCcw, Save } from '@lucide/vue'
import { readTextFile } from '@tauri-apps/plugin-fs'
import * as monaco from 'monaco-editor'

import { colorMode } from '~/composables/color-mode'
import dayjs from '~/plugins/dayjs'
import { BASE_EDITOR_OPTIONS, THEME_DARK, THEME_LIGHT } from '~/plugins/editor'
import { backupManager } from '~/services/backup-manager'
import { useBackupStore } from '~/stores/backup'
import { useEditorStore } from '~/stores/editor'
import { useModalStore } from '~/stores/modal'
import { handleError } from '~/utils/error-handler'

import type { BackupEntry, BackupSourceKind } from '~/commands/backup'

interface Props {
  projectPath: string
  logicalPath: string
}

type SectionKey = 'today' | 'yesterday' | 'thisWeek' | 'earlier'

interface Section {
  key: SectionKey
  items: BackupEntry[]
}

const PAGE_SIZE = 50

const SOURCE_ICONS: Record<BackupSourceKind, typeof Save> = {
  'manual-save': Save,
  'auto-save': Clock,
  'restore': RotateCcw,
}

const SECTION_ORDER: SectionKey[] = ['today', 'yesterday', 'thisWeek', 'earlier']

const { projectPath, logicalPath } = defineProps<Props>()

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const store = useBackupStore()
const modalStore = useModalStore()
const { timeline, loading, restoring } = $(store)

let selectedBackupPath = $ref<string | undefined>(undefined)
let visibleCount = $ref(PAGE_SIZE)
let originalContent = $ref('')
let modifiedContent = $ref('')
let editorContainer = $ref<HTMLElement>()
let diffEditor = $shallowRef<monaco.editor.IStandaloneDiffEditor>()

const selectedEntry = $computed(() =>
  timeline.find(entry => entry.backupPath === selectedBackupPath),
)

const currentTheme = $computed(() => colorMode.value === 'dark' ? THEME_DARK : THEME_LIGHT)

const hasMore = $computed(() => visibleCount < timeline.length)

const displayName = $computed(() => logicalPath.replace(/^game\/scene\//, ''))

const sections = $computed<Section[]>(() => {
  const buckets: Record<SectionKey, BackupEntry[]> = {
    today: [],
    yesterday: [],
    thisWeek: [],
    earlier: [],
  }
  const now = dayjs()
  const startOfToday = now.startOf('day')
  const startOfYesterday = startOfToday.subtract(1, 'day')
  const startOfWeek = now.startOf('week')

  for (const entry of timeline.slice(0, visibleCount)) {
    const at = dayjs(entry.timestamp)
    if (at.isAfter(startOfToday) || at.isSame(startOfToday)) {
      buckets.today.push(entry)
    } else if (at.isAfter(startOfYesterday) || at.isSame(startOfYesterday)) {
      buckets.yesterday.push(entry)
    } else if (at.isAfter(startOfWeek) || at.isSame(startOfWeek)) {
      buckets.thisWeek.push(entry)
    } else {
      buckets.earlier.push(entry)
    }
  }

  return SECTION_ORDER
    .map(key => ({ key, items: buckets[key] }))
    .filter(section => section.items.length > 0)
})

function sourceLabel(kind: BackupSourceKind): string {
  switch (kind) {
    case 'manual-save': {
      return t('modals.backupTimeline.sourceKind.manualSave')
    }
    case 'auto-save': {
      return t('modals.backupTimeline.sourceKind.autoSave')
    }
    case 'restore': {
      return t('modals.backupTimeline.sourceKind.restore')
    }
    default: {
      return ''
    }
  }
}

function sectionLabel(key: SectionKey): string {
  switch (key) {
    case 'today': {
      return t('modals.backupTimeline.section.today')
    }
    case 'yesterday': {
      return t('modals.backupTimeline.section.yesterday')
    }
    case 'thisWeek': {
      return t('modals.backupTimeline.section.thisWeek')
    }
    case 'earlier': {
      return t('modals.backupTimeline.section.earlier')
    }
    default: {
      return ''
    }
  }
}

function relativeTime(iso: string): string {
  return dayjs(iso).fromNow()
}

function absoluteTime(iso: string): string {
  return dayjs(iso).format('YYYY-MM-DD HH:mm:ss')
}

function loadMore(): void {
  visibleCount = Math.min(visibleCount + PAGE_SIZE, timeline.length)
}

function entryButtonClass(entry: BackupEntry): string {
  if (selectedBackupPath === entry.backupPath) {
    return 'bg-accent text-accent-foreground'
  }
  if (entry.sourceKind === 'auto-save') {
    return 'text-muted-foreground hover:bg-muted'
  }
  return 'hover:bg-muted'
}

function disposeDiffEditor(): void {
  if (!diffEditor) {
    return
  }
  const model = diffEditor.getModel()
  diffEditor.dispose()
  diffEditor = undefined
  model?.original.dispose()
  model?.modified.dispose()
}

async function readCurrentSource(): Promise<string> {
  const absolute = `${projectPath.replace(/\/+$/, '')}/${logicalPath}`
  // 编辑器已打开且有未保存改动时，diff 右侧应反映用户眼前的文本，而不是磁盘已保存内容
  const buffered = useEditorStore().getDirtyBufferContent(absolute)
  if (buffered !== undefined) {
    return buffered
  }
  try {
    return await readTextFile(absolute)
  } catch {
    return ''
  }
}

async function loadDiffSources(entry: BackupEntry): Promise<void> {
  try {
    const [historical, current] = await Promise.all([
      backupManager.readBackupContent(projectPath, entry.backupPath),
      readCurrentSource(),
    ])
    originalContent = historical
    modifiedContent = current
  } catch (error) {
    handleError(error)
  }
}

watch(() => open.value, async (isOpen) => {
  if (!isOpen) {
    selectedBackupPath = undefined
    visibleCount = PAGE_SIZE
    store.clearTimeline()
    disposeDiffEditor()
    return
  }
  await store.loadTimeline(projectPath, logicalPath)
  selectedBackupPath = timeline[0]?.backupPath
}, { immediate: true })

watch($$(selectedEntry), (entry) => {
  if (entry) {
    void loadDiffSources(entry)
  } else {
    originalContent = ''
    modifiedContent = ''
  }
})

watchEffect(() => {
  if (!editorContainer || !open.value || diffEditor) {
    return
  }
  const editor = monaco.editor.createDiffEditor(editorContainer, {
    ...BASE_EDITOR_OPTIONS,
    readOnly: true,
    renderSideBySide: true,
    renderLineHighlight: 'line',
    renderLineHighlightOnlyWhenFocus: true,
    automaticLayout: true,
  })
  // 创建后立即给一对初始 model，避免依赖 monaco 默认 model 的释放时机
  editor.setModel({
    original: monaco.editor.createModel(originalContent, 'webgalscript'),
    modified: monaco.editor.createModel(modifiedContent, 'webgalscript'),
  })
  monaco.editor.setTheme(currentTheme)
  diffEditor = editor
})

watch($$(currentTheme), (theme) => {
  if (diffEditor) {
    monaco.editor.setTheme(theme)
  }
})

watch([$$(originalContent), $$(modifiedContent)], ([original, modified]) => {
  const editor = diffEditor
  if (!editor) {
    return
  }
  const previous = editor.getModel()
  editor.setModel({
    original: monaco.editor.createModel(original, 'webgalscript'),
    modified: monaco.editor.createModel(modified, 'webgalscript'),
  })
  previous?.original.dispose()
  previous?.modified.dispose()
})

async function runRestore(entry: BackupEntry): Promise<void> {
  try {
    await store.restoreEntry(entry)
    toast.success(t('modals.backupTimeline.restoreSuccess'))
    selectedBackupPath = timeline[0]?.backupPath
  } catch (error) {
    handleError(error)
  }
}

function confirmRestore(): void {
  if (!selectedEntry) {
    return
  }
  const entry = selectedEntry
  modalStore.open('AlertModal', {
    title: t('modals.backupTimeline.restoreConfirmTitle'),
    content: t('modals.backupTimeline.restoreConfirmContent', {
      time: absoluteTime(entry.timestamp),
    }),
    onConfirm: () => {
      void runRestore(entry)
    },
  })
}
</script>

<template>
  <Dialog ::open="open">
    <DialogContent
      class="2xl:(max-w-400 w-75%) md:max-w-210 sm:max-w-180 xl:max-w-240"
      @open-auto-focus="event => event.preventDefault()"
    >
      <DialogHeader>
        <DialogTitle class="flex gap-2 items-center">
          {{ $t('modals.backupTimeline.title') }}
          <span class="text-sm text-muted-foreground font-normal truncate">{{ displayName }}</span>
        </DialogTitle>
        <DialogDescription>
          {{ $t('modals.backupTimeline.description') }}
        </DialogDescription>
      </DialogHeader>

      <div class="h-[60vh]">
        <div v-if="loading" class="text-sm text-muted-foreground flex h-full items-center justify-center">
          {{ $t('common.loading') }}
        </div>
        <Empty v-else-if="timeline.length === 0" class="border-0 h-full">
          <EmptyContent>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <History />
              </EmptyMedia>
              <EmptyDescription>
                {{ $t('modals.backupTimeline.empty') }}
              </EmptyDescription>
            </EmptyHeader>
          </EmptyContent>
        </Empty>
        <div v-else class="gap-3 grid grid-cols-[200px_1fr] h-full">
          <aside class="border rounded-md flex flex-col overflow-hidden">
            <ScrollArea class="h-full">
              <div class="flex flex-col">
                <template v-for="section in sections" :key="section.key">
                  <div class="text-xs text-muted-foreground font-semibold px-3 pb-1 pt-3">
                    {{ sectionLabel(section.key) }}
                  </div>
                  <TooltipProvider
                    v-for="entry in section.items"
                    :key="entry.backupPath"
                  >
                    <Tooltip>
                      <TooltipTrigger as-child>
                        <button
                          :class="[
                            'text-left text-sm px-3 py-1.5 transition-colors flex gap-1.5 items-center',
                            entryButtonClass(entry),
                          ]"
                          @click="selectedBackupPath = entry.backupPath"
                        >
                          <component
                            :is="SOURCE_ICONS[entry.sourceKind]"
                            class="shrink-0 size-3.5"
                            :class="entry.sourceKind === 'auto-save' && 'opacity-60'"
                          />
                          <span class="text-13px truncate">{{ sourceLabel(entry.sourceKind) }}</span>
                          <span class="text-xs text-muted-foreground ml-auto pl-2 shrink-0">
                            {{ relativeTime(entry.timestamp) }}
                          </span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {{ absoluteTime(entry.timestamp) }}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </template>
                <button
                  v-if="hasMore"
                  class="text-xs text-muted-foreground py-2.5 transition-colors hover:text-foreground"
                  @click="loadMore"
                >
                  {{ $t('modals.backupTimeline.loadMore') }}
                </button>
              </div>
            </ScrollArea>
          </aside>
          <div ref="editorContainer" class="border rounded-md overflow-hidden" />
        </div>
      </div>

      <DialogFooter>
        <Button :disabled="!selectedEntry || restoring" @click="confirmRestore">
          {{ $t('modals.backupTimeline.restore') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
