<script setup lang="ts">
import { useDragSort } from '~/composables/useDragSort'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'
import { useVisualEditorFocusRequest } from '~/features/editor/visual-editor/useVisualEditorFocusRequest'
import { useVisualEditorSceneRuntime } from '~/features/editor/visual-editor/useVisualEditorSceneRuntime'
import { findSelectedVisualEditorStatementCard } from '~/features/editor/visual-editor/visual-editor-focus'
import { useEditSettingsStore } from '~/stores/edit-settings'
import { SceneVisualProjectionState } from '~/stores/editor'
import { usePreferenceStore } from '~/stores/preference'

import type { ScrollArea } from '~/components/ui/scroll-area'

interface Props {
  state: SceneVisualProjectionState
}

const props = defineProps<Props>()

const editSettings = useEditSettingsStore()
const editorSurfaceRef = useTemplateRef<HTMLDivElement>('editorSurfaceRef')
const preferenceStore = usePreferenceStore()
const scrollAreaRef = useTemplateRef<InstanceType<typeof ScrollArea>>('scrollAreaRef')
const statementListRef = useTemplateRef<HTMLElement>('statementListRef')
const runtime = useVisualEditorSceneRuntime({
  getScrollArea: () => scrollAreaRef.value,
  getState: () => props.state,
})

const {
  handleCollapsedUpdate,
  handlePlayTo,
  handleSelect,
  handleStatementDelete,
  handleStatementUpdate,
  isPositioning,
  isStatementCollapsed,
  measureRowElement,
  previousSpeakers,
  reorderStatements,
  selectedStatementId,
  statementSortVirtualAdapter,
  totalSize,
  virtualRows,
} = runtime

const statements = computed(() => props.state.statements)
const scrollViewportRef = shallowRef<HTMLElement>()
const statementReadonly = $computed(() => preferenceStore.showSidebar && editSettings.collapseStatementsOnSidebarOpen)
const statementSort = useDragSort({
  direction: 'vertical',
  getKey: statement => String(statement.id),
  getPayload: statement => ({
    source: 'visual-editor',
    statementId: statement.id,
    type: 'scene-statement',
  }),
  handleSelector: '[data-statement-drag-handle]',
  items: statements,
  onSort: handleStatementSort,
  scrollContainer: scrollViewportRef,
  virtualAdapter: statementSortVirtualAdapter,
})
const statementOverlayState = computed(() => statementSort.overlayState.value)
const statementOverlayIndex = computed(() => {
  const overlayStatement = statementOverlayState.value?.item
  if (!overlayStatement) {
    return -1
  }

  return props.state.statements.findIndex(statement => statement.id === overlayStatement.id)
})
const statementOverlayPreviousSpeaker = computed(() => {
  const overlayIndex = statementOverlayIndex.value
  return overlayIndex === -1 ? '' : previousSpeakers.value[overlayIndex] ?? ''
})

function handleStatementSort(fromIndex: number, toIndex: number) {
  reorderStatements(fromIndex, toIndex, { restoreSelectionPresentation: false })
  editorSurfaceRef.value?.focus({ preventScroll: true })
}

function updateScrollViewportRef() {
  scrollViewportRef.value = scrollAreaRef.value?.viewport?.viewportElement
}

function updateStatementSortRefs() {
  statementSort.containerRef.value = statementListRef.value ?? undefined
  updateScrollViewportRef()
}

function handleOverlayCollapsedUpdate(collapsed: boolean) {
  const statementId = statementOverlayState.value?.item.id
  if (statementId !== undefined) {
    handleCollapsedUpdate(statementId, collapsed)
  }
}

useShortcutContext({
  panelFocus: 'editor',
}, {
  target: editorSurfaceRef,
  trackFocus: true,
})

useVisualEditorFocusRequest({
  path: computed(() => props.state.path),
  resolveFocusTarget(root) {
    const selectedCard = findSelectedVisualEditorStatementCard(root)
    return selectedCard instanceof HTMLElement ? selectedCard : undefined
  },
  rootElement: editorSurfaceRef,
})

onMounted(() => {
  updateStatementSortRefs()
})
</script>

<template>
  <div ref="editorSurfaceRef" tabindex="-1" class="outline-none h-full">
    <ScrollArea ref="scrollAreaRef" class="h-full" :style="{ opacity: isPositioning ? 0 : 1 }">
      <div ref="statementListRef" role="listbox" :aria-label="$t('edit.visualEditor.statementList')" :style="{ height: `${totalSize}px`, width: '100%', position: 'relative' }">
        <div
          v-for="row in virtualRows"
          :key="(row.key as number)"
          :ref="measureRowElement"
          :data-index="row.index"
          class="px-2"
          :class="editSettings.collapseStatementsOnSidebarOpen ? 'pb-1' : 'pb-1.5'"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${row.start}px)`,
          }"
        >
          <div
            v-bind="statementSort.getItemProps(row.index)"
            :style="statementSort.getItemStyle(row.index)"
          >
            <VisualEditorStatementCard
              :collapsed="isStatementCollapsed(props.state.statements[row.index].id)"
              :entry="props.state.statements[row.index]"
              :index="row.index"
              :play-to-disabled="props.state.isDirty"
              :selected="props.state.statements[row.index].id === selectedStatementId"
              :readonly="statementReadonly"
              :previous-speaker="previousSpeakers[row.index]"
              @update="handleStatementUpdate"
              @update:collapsed="val => handleCollapsedUpdate(props.state.statements[row.index].id, val)"
              @select="handleSelect"
              @delete="handleStatementDelete"
              @play-to="handlePlayTo"
            />
          </div>
        </div>
      </div>
    </ScrollArea>

    <DragOverlay
      :visible="statementOverlayState !== undefined"
      :frame-style="statementOverlayState?.overlayFrameStyle"
      :overlay-style="statementOverlayState?.overlayStyle"
    >
      <VisualEditorStatementCard
        v-if="statementOverlayState"
        :collapsed="isStatementCollapsed(statementOverlayState.item.id)"
        :entry="statementOverlayState.item"
        :index="statementOverlayIndex"
        :play-to-disabled="true"
        :selected="statementOverlayState.item.id === selectedStatementId"
        :readonly="statementReadonly"
        :previous-speaker="statementOverlayPreviousSpeaker"
        @update="handleStatementUpdate"
        @update:collapsed="handleOverlayCollapsedUpdate"
        @select="handleSelect"
        @delete="handleStatementDelete"
        @play-to="handlePlayTo"
      >
        <template #actions />
      </VisualEditorStatementCard>
    </DragOverlay>
  </div>
</template>
