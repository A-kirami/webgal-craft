<script setup lang="ts">
import { useDragSort } from '~/composables/useDragSort'
import { getCloseTabDecision, shouldFixPreviewTab } from '~/features/editor/editor-tabs/editor-tabs'
import { useEditorStore } from '~/stores/editor'
import { useModalStore } from '~/stores/modal'
import { useTabsStore } from '~/stores/tabs'
import { handleWheelToHorizontalScroll } from '~/utils/wheel'

import type { ScrollArea } from '~/components/ui/scroll-area'
import type { Tab } from '~/stores/tabs'

const { t } = useI18n()

const tabsStore = useTabsStore()
const editorStore = useEditorStore()
const modalStore = useModalStore()
const tabs = toRef(tabsStore, 'tabs')
const activeTabPath = $computed(() => tabsStore.activeTab?.path)

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
      <EditorTabButton
        v-for="(tab, index) in tabs"
        :key="tab.path"
        v-bind="tabSort.getItemProps(index)"
        :active="isActiveTab(tab)"
        :sorting="tabSort.isSorting.value"
        :tab="tab"
        :tint-class="getTabTintClass(tab)"
        :item-style="tabSort.getItemStyle(index)"
        :data-active="isActiveTab(tab)"
        :data-testid="`editor-tab-${tab.path}`"
        @click="handleTabClick(index)"
        @dblclick="handleTabDblClick(index)"
        @auxclick="handleTabAuxClick(index, $event)"
        @close="handleCloseTab(index)"
      />
    </div>
    <ScrollBar orientation="horizontal" class="opacity-75 h-1.5 -mb-0.25 hover:opacity-100" />
  </ScrollArea>

  <DragOverlay
    :visible="tabSort.overlayState.value !== undefined"
    :overlay-style="tabSort.overlayState.value?.overlayStyle"
  >
    <EditorTabButton
      v-if="tabSort.overlayState.value"
      as="div"
      tabindex="-1"
      :active="isActiveTab(tabSort.overlayState.value.item)"
      :close-interactive="false"
      :sorting="tabSort.isSorting.value"
      :tab="tabSort.overlayState.value.item"
      :tint-class="getTabTintClass(tabSort.overlayState.value.item, true)"
    />
  </DragOverlay>
</template>
