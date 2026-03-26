<script setup lang="ts">
import { FileText, X } from 'lucide-vue-next'

import { getCloseTabDecision, shouldFixPreviewTab } from '~/features/editor/editor-tabs/editor-tabs'
import { useEditorStore } from '~/stores/editor'
import { useModalStore } from '~/stores/modal'
import { useTabsStore } from '~/stores/tabs'
import { handleWheelToHorizontalScroll } from '~/utils/wheel'

import type { ScrollArea } from '~/components/ui/scroll-area'

const { t } = useI18n()

const tabsStore = useTabsStore()
const editorStore = useEditorStore()
const modalStore = useModalStore()

const scrollAreaRef = $(useTemplateRef('scrollAreaRef'))

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
</script>

<template>
  <ScrollArea ref="scrollAreaRef" @wheel="handleWheelToHorizontalScroll">
    <div class="bg-background flex h-8">
      <Button
        v-for="(tab, index) in tabsStore.tabs"
        :key="tab.path"
        variant="ghost"
        class="group pl-3 pr-1 border-r rounded-none h-full relative"
        :class="[
          tabsStore.activeTab?.path === tab.path
            ? 'bg-muted before:bg-primary'
            : 'hover:bg-muted/50'
        ]"
        :data-active="tabsStore.activeTab?.path === tab.path"
        un-before="h-0.5 w-full absolute top-0 inset-x-0 content-empty"
        @click="() => handleTabClick(index)"
        @dblclick="() => handleTabDblClick(index)"
        @auxclick="(e: MouseEvent) => e.button === 1 && handleCloseTab(index)"
      >
        <div class="flex gap-1.5 items-center">
          <FileText class="size-4" />
          <span
            class="text-sm font-light"
            :class="{ 'italic': tab.isPreview }"
          >
            {{ tab.name }}
          </span>
          <Button
            variant="ghost"
            size="icon"
            class="group/close rounded flex h-5 w-5 items-center justify-center relative hover:bg-muted-foreground/20"
            as="div"
            tabindex="-1"
            @click.stop="() => handleCloseTab(index)"
          >
            <div class="flex size-3 items-center justify-center relative">
              <span
                v-if="tab.isModified"
                class="rounded-full bg-muted-foreground/50 opacity-100 size-2 transition-opacity absolute group-hover/close:opacity-0"
              />
              <X
                class="size-3 transition-opacity"
                :class="[
                  !tab.isModified && tabsStore.activeTab?.path === tab.path ? 'opacity-100' :
                  tab.isModified ? 'opacity-0 group-hover/close:opacity-100' :
                  'opacity-0 group-hover:opacity-100'
                ]"
              />
            </div>
            <span class="sr-only">{{ $t('common.close') }}</span>
          </Button>
        </div>
      </Button>
    </div>
    <ScrollBar orientation="horizontal" class="opacity-75 h-1.5 -mb-0.25 hover:opacity-100" />
  </ScrollArea>
</template>
