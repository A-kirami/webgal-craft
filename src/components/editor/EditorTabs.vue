<script setup lang="ts">
import { revealItemInDir } from '@tauri-apps/plugin-opener'

import { useDragSort } from '~/composables/useDragSort'
import { AbsPath, RelPath } from '~/domain/path'
import { getEditorTabPathHints, getEditorTabResourceRootPath } from '~/features/editor/editor-tabs/editor-tab-path-hints'
import {
  getCloseTabDecision,
  getEditorTabCloseTargets,
  shouldFixPreviewTab,
} from '~/features/editor/editor-tabs/editor-tabs'
import { backupManager } from '~/services/backup-manager'
import { useEditorStore } from '~/stores/editor'
import { useEditorDiagnosticsStore } from '~/stores/editor-diagnostics'
import { useModalStore } from '~/stores/modal'
import { useTabsStore } from '~/stores/tabs'
import { useWorkspaceStore } from '~/stores/workspace'
import { handleWheelToHorizontalScroll } from '~/utils/wheel'

import type { ScrollArea } from '~/components/ui/scroll-area'
import type { EditorTabBatchCloseAction, EditorTabContextMenuAction } from '~/features/editor/editor-tabs/editor-tabs'
import type { Tab } from '~/stores/tabs'

const { t } = useI18n()

const tabsStore = useTabsStore()
const diagnosticsStore = useEditorDiagnosticsStore()
const editorStore = useEditorStore()
const modalStore = useModalStore()
const workspaceStore = useWorkspaceStore()
const tabs = toRef(tabsStore, 'tabs')
const activeTabPath = $computed(() => tabsStore.activeTab?.path)
const pathHints = $computed(() => getEditorTabPathHints(tabs.value.map(tab => ({
  name: tab.name,
  path: tab.path,
  resourceRootPath: getEditorTabResourceRootPath(tab.path, workspaceStore.currentGame?.path),
}))))

const scrollAreaRef = $(useTemplateRef('scrollAreaRef'))
const scrollViewportRef = shallowRef<HTMLElement>()
const tabSort = useDragSort<Tab>({
  direction: 'horizontal',
  getKey: tab => tab.path,
  getPayload: tab => ({
    path: tab.path,
    source: 'editor-tabs',
    type: 'editor-tab',
  }),
  ignoreSelector: '[data-drag-ignore]',
  items: tabs,
  onSort: tabsStore.reorderTab,
  scrollContainer: scrollViewportRef,
})

function setTabSortContainerRef(element: Element | ComponentPublicInstance | null) {
  tabSort.containerRef.value = element instanceof HTMLElement ? element : undefined
  nextTick(updateScrollViewportRef)
}

function updateScrollViewportRef() {
  scrollViewportRef.value = scrollAreaRef?.viewport?.viewportElement
}

function isActiveTab(tab: Tab): boolean {
  return activeTabPath === tab.path
}

function getTabPathHint(tab: Tab): string | undefined {
  return pathHints.get(tab.path)
}

function getTabTintClass(tab: Tab, isDragOverlay = false): string {
  if (isActiveTab(tab)) {
    return 'opacity-0'
  }

  return isDragOverlay ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
}

function handleCloseTab(index: number) {
  const tab = tabsStore.tabs[index]
  if (!tab) {
    return
  }

  const decision = getCloseTabDecision({
    tab,
    tabIndex: index,
    modalTitle: t('modals.saveChanges.title', { name: tab.name }),
    logger,
    saveFile: editorStore.saveFile,
    findTabIndex: tabsStore.findTabIndex,
    closeTab: tabsStore.closeTab,
  })

  if (decision.type === 'close') {
    tabsStore.closeTab(decision.index)
    return
  }

  modalStore.open('SaveChangesModal', decision.modal)
}

function handleTabClick(index: number) {
  tabsStore.activateTab(index)
}

function handleTabDblClick(index: number) {
  const tab = tabsStore.tabs[index]
  if (shouldFixPreviewTab(tab)) {
    tabsStore.fixPreviewTab(index)
  }
}

function handleTabAuxClick(index: number, event: MouseEvent) {
  if (event.button === 1) {
    handleCloseTab(index)
  }
}

function closeTabPaths(paths: readonly AbsPath[]): void {
  const indices = paths
    .map(path => tabsStore.findTabIndex(path))
    .filter((index): index is number => index !== -1)

  tabsStore.closeTabs(indices)
}

function getSceneLogicalPath(path: AbsPath): RelPath | undefined {
  const projectPath = workspaceStore.CWD
  if (!projectPath) {
    return
  }

  const logicalPath = backupManager.toProjectRelative(projectPath, path)
  return logicalPath && backupManager.isScenePath(logicalPath) ? logicalPath : undefined
}

function handleCloseTabs(action: EditorTabBatchCloseAction, targetPath: AbsPath): void {
  const targets = getEditorTabCloseTargets(tabs.value, targetPath, action)
  if (targets.length === 0) {
    return
  }

  const targetPaths = targets.map(tab => tab.path)
  const modifiedTabs = targets.filter(tab => tab.isModified)
  if (modifiedTabs.length === 0) {
    closeTabPaths(targetPaths)
    return
  }

  const hasMultipleModifiedTabs = modifiedTabs.length > 1
  modalStore.open('SaveChangesModal', {
    title: hasMultipleModifiedTabs
      ? t('edit.editorTabs.saveChangesTitle', { count: modifiedTabs.length })
      : t('modals.saveChanges.title', { name: modifiedTabs[0]!.name }),
    description: hasMultipleModifiedTabs
      ? t('edit.editorTabs.saveChangesDescription')
      : undefined,
    onSave: async () => {
      try {
        await Promise.all(modifiedTabs.map(tab => editorStore.saveFile(tab.path)))
        closeTabPaths(targetPaths)
      } catch (error) {
        logger.error(`保存文件失败: ${error}`)
      }
    },
    onDontSave: () => closeTabPaths(targetPaths),
  })
}

function handleViewHistory(path: AbsPath): void {
  const projectPath = workspaceStore.CWD
  const logicalPath = getSceneLogicalPath(path)
  if (!projectPath || !logicalPath) {
    return
  }

  modalStore.open('BackupTimelineDialog', {
    projectPath,
    logicalPath,
  })
}

async function handleRevealInExplorer(path: AbsPath): Promise<void> {
  try {
    await revealItemInDir(path)
  } catch (error) {
    logger.error(`打开文件管理器失败: ${error}`)
  }
}

function handleTabContextMenuAction(action: EditorTabContextMenuAction, path: AbsPath): void {
  if (action === 'close') {
    const index = tabsStore.findTabIndex(path)
    if (index !== -1) {
      handleCloseTab(index)
    }
    return
  }

  if (action === 'viewHistory') {
    handleViewHistory(path)
    return
  }

  if (action === 'revealInExplorer') {
    void handleRevealInExplorer(path)
    return
  }

  handleCloseTabs(action, path)
}

const canCloseOthers = $computed(() => tabs.value.length > 1)

const canCloseSaved = $computed(() => tabs.value.some(tab => !tab.isModified))

function canCloseRight(index: number): boolean {
  return index < tabs.value.length - 1
}

function canViewHistory(path: AbsPath): boolean {
  return getSceneLogicalPath(path) !== undefined
}

function scrollToActiveTab() {
  const viewport = scrollAreaRef?.viewport?.viewportElement
  if (!viewport) {
    return
  }

  const activeTabElement = viewport.querySelector('[data-active="true"]') as HTMLElement
  if (!activeTabElement) {
    return
  }

  const viewportRect = viewport.getBoundingClientRect()
  const activeTabRect = activeTabElement.getBoundingClientRect()

  const isVisible = activeTabRect.left >= viewportRect.left && activeTabRect.right <= viewportRect.right

  if (!isVisible) {
    activeTabElement.scrollIntoView({
      inline: 'nearest',
      behavior: 'auto',
    })
  }
}

watch(() => tabsStore.activeTabIndex, () => {
  if (tabsStore.activeTab) {
    nextTick(scrollToActiveTab)
  }
})

onMounted(() => {
  updateScrollViewportRef()
})
</script>

<template>
  <ScrollArea ref="scrollAreaRef" @wheel="handleWheelToHorizontalScroll">
    <div :ref="setTabSortContainerRef" class="bg-background flex h-8">
      <EditorTabContextMenu
        v-for="(tab, index) in tabs"
        :key="tab.path"
        :can-close-others="canCloseOthers"
        :can-close-right="canCloseRight(index)"
        :can-close-saved="canCloseSaved"
        :can-view-history="canViewHistory(tab.path)"
        @action="handleTabContextMenuAction($event, tab.path)"
      >
        <EditorTabButton
          v-bind="tabSort.getItemProps(index)"
          :active="isActiveTab(tab)"
          :diagnostic-severity="diagnosticsStore.getHighestSeverity(tab.path)"
          :sorting="tabSort.isSorting.value"
          :tab="tab"
          :path-hint="getTabPathHint(tab)"
          :tint-class="getTabTintClass(tab)"
          :item-style="tabSort.getItemStyle(index)"
          :data-active="isActiveTab(tab)"
          :data-testid="`editor-tab-${tab.path}`"
          @click="handleTabClick(index)"
          @dblclick="handleTabDblClick(index)"
          @auxclick="handleTabAuxClick(index, $event)"
          @close="handleCloseTab(index)"
        />
      </EditorTabContextMenu>
    </div>
    <ScrollBar orientation="horizontal" class="opacity-75 h-1.5 -mb-0.25 hover:opacity-100" />
  </ScrollArea>

  <DragOverlay
    :visible="tabSort.overlayState.value !== undefined"
    :frame-style="tabSort.overlayState.value?.overlayFrameStyle"
    :overlay-style="tabSort.overlayState.value?.overlayStyle"
  >
    <EditorTabButton
      v-if="tabSort.overlayState.value"
      as="div"
      tabindex="-1"
      :active="isActiveTab(tabSort.overlayState.value.item)"
      :diagnostic-severity="diagnosticsStore.getHighestSeverity(tabSort.overlayState.value.item.path)"
      :close-interactive="false"
      :sorting="tabSort.isSorting.value"
      :tab="tabSort.overlayState.value.item"
      :path-hint="getTabPathHint(tabSort.overlayState.value.item)"
      :tint-class="getTabTintClass(tabSort.overlayState.value.item, true)"
    />
  </DragOverlay>
</template>
