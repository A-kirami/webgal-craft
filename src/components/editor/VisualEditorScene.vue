<script setup lang="ts">
import { FileText } from '@lucide/vue'

import { useDragSort } from '~/composables/useDragSort'
import { useDroppableRegistry } from '~/composables/useDroppableRegistry'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'
import { useVisualEditorFocusRequest } from '~/features/editor/visual-editor/useVisualEditorFocusRequest'
import { useVisualEditorSceneRuntime } from '~/features/editor/visual-editor/useVisualEditorSceneRuntime'
import { INSERT_BAND_SIZE_PX, isVisualEditorInsertDropPlacement } from '~/features/editor/visual-editor/visual-editor-drop'
import { findSelectedVisualEditorStatementCard } from '~/features/editor/visual-editor/visual-editor-focus'
import { useEditSettingsStore } from '~/stores/edit-settings'
import { SceneVisualProjectionState } from '~/stores/editor'
import { usePreferenceStore } from '~/stores/preference'

import type { ComponentPublicInstance } from 'vue'
import type { ScrollArea } from '~/components/ui/scroll-area'
import type { StatementEntry } from '~/domain/script/sentence'
import type { VisualEditorFileDropTarget } from '~/features/editor/visual-editor/useVisualEditorSceneRuntime'
import type { DragPayload } from '~/types/drag-drop'

interface Props {
  state: SceneVisualProjectionState
}

interface RenderedVisualStatementRow {
  insertDropKey: string
  insertDropSlot: string
  insertDropTarget: VisualEditorFileDropTarget
  index: number
  key: string | number
  start: number
  statement: StatementEntry
  updateDropTarget: VisualEditorFileDropTarget
}

const props = defineProps<Props>()

const editSettings = useEditSettingsStore()
const dropRegistry = useDroppableRegistry()
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
const isSceneEmpty = computed(() => props.state.statements.length === 0)
const scrollViewportRef = shallowRef<HTMLElement>()
const statementReadonly = $computed(() => preferenceStore.showSidebar && editSettings.collapseStatementsOnSidebarOpen)
const renderedStatementRows = computed<RenderedVisualStatementRow[]>(() => {
  const rows: RenderedVisualStatementRow[] = []

  for (const row of unref(virtualRows)) {
    const statement = props.state.statements[row.index]
    if (!statement) {
      continue
    }

    const previousStatement = row.index === 0 ? undefined : props.state.statements[row.index - 1]
    if (row.index > 0 && !previousStatement) {
      continue
    }

    rows.push({
      insertDropKey: previousStatement ? `gap:${previousStatement.id}:${statement.id}` : 'head',
      insertDropSlot: previousStatement ? `gap-${previousStatement.id}-${statement.id}` : 'head',
      insertDropTarget: {
        insertIndex: row.index,
        placement: previousStatement ? 'gap' : 'head',
      },
      index: row.index,
      key: row.key as string | number,
      start: row.start,
      statement,
      updateDropTarget: {
        insertIndex: row.index,
        placement: 'update',
        statementId: statement.id,
      },
    })
  }

  return rows
})
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
const { height: scrollViewportHeight } = useElementSize(() => scrollViewportRef.value)
const contentMinHeight = computed(() =>
  scrollViewportHeight.value > 0 ? `${scrollViewportHeight.value}px` : undefined,
)
const statementRowGapSize = computed(() =>
  editSettings.collapseStatementsOnSidebarOpen ? '0.25rem' : '0.375rem',
)
const statementRowGapHalfSize = computed(() =>
  editSettings.collapseStatementsOnSidebarOpen ? '0.125rem' : '0.1875rem',
)
const tailDropAreaSize = `${INSERT_BAND_SIZE_PX * 4}px`
const tailDropAreaOffset = computed(() =>
  `calc(-${INSERT_BAND_SIZE_PX * 2}px - ${statementRowGapSize.value})`,
)
const headDropTargetTopInset = `-${INSERT_BAND_SIZE_PX}px`
const headDropIndicatorTopInset = `-${INSERT_BAND_SIZE_PX / 2}px`
const dropElements = new Map<string, HTMLElement>()
let activeDropIndicator = $ref<VisualEditorFileDropTarget>()
const tailDropTarget = $computed<VisualEditorFileDropTarget>(() => ({
  insertIndex: props.state.statements.length,
  placement: 'tail',
}))

function handleStatementSort(fromIndex: number, toIndex: number) {
  reorderStatements(fromIndex, toIndex, { restoreSelectionPresentation: false })
  editorSurfaceRef.value?.focus({ preventScroll: true })
}

function buildInsertDropStyle(row: RenderedVisualStatementRow): Record<string, string> {
  return {
    height: row.index === 0
      ? `${INSERT_BAND_SIZE_PX * 2}px`
      : `calc(${INSERT_BAND_SIZE_PX * 2}px + ${statementRowGapSize.value})`,
    top: row.index === 0
      ? headDropTargetTopInset
      : `calc(-${INSERT_BAND_SIZE_PX}px - ${statementRowGapSize.value})`,
  }
}

function buildInsertIndicatorStyle(row: RenderedVisualStatementRow): Record<string, string> {
  return {
    top: row.index === 0 ? headDropIndicatorTopInset : `-${statementRowGapHalfSize.value}`,
  }
}

function resolveHTMLElement(value: Element | ComponentPublicInstance | null): HTMLElement | undefined {
  return value instanceof HTMLElement ? value : undefined
}

function setActiveDropIndicator(target?: VisualEditorFileDropTarget) {
  activeDropIndicator = target
}

function canHandleDropPayload(payload: DragPayload, target: VisualEditorFileDropTarget): boolean {
  if (payload.type === 'file-system-item') {
    return runtime.canHandleFileDrop(payload, target)
  }

  if (payload.type === 'command-panel-statement') {
    if (!isVisualEditorInsertDropPlacement(target.placement)) {
      return false
    }
    return runtime.canHandleCommandDrop(payload, target)
  }

  return false
}

function handleDropPayload(payload: DragPayload, target: VisualEditorFileDropTarget): boolean {
  if (payload.type === 'file-system-item') {
    return runtime.handleFileDrop(payload, target)
  }

  if (payload.type === 'command-panel-statement') {
    return runtime.handleCommandDrop(payload, target)
  }

  return false
}

function registerDropTarget(
  key: string,
  element: HTMLElement | undefined,
  target: VisualEditorFileDropTarget,
) {
  const previous = dropElements.get(key)
  if (previous && previous !== element) {
    dropRegistry.unregisterDroppable(previous)
    dropElements.delete(key)
  }

  if (!element) {
    return
  }

  dropElements.set(key, element)
  dropRegistry.registerDroppable(element, {
    accept: target.placement === 'update'
      ? 'file-system-item'
      : ['file-system-item', 'command-panel-statement'],
    canDrop(payload) {
      return canHandleDropPayload(payload, target)
    },
    id: `visual-editor:${key}`,
    onDragEnter(payload) {
      if (payload.type === 'command-panel-statement' && !isVisualEditorInsertDropPlacement(target.placement)) {
        return
      }

      if (!canHandleDropPayload(payload, target)) {
        return
      }

      setActiveDropIndicator(target)
    },
    onDragLeave() {
      setActiveDropIndicator(undefined)
    },
    onDrop(payload) {
      setActiveDropIndicator(undefined)

      if (handleDropPayload(payload, target)) {
        editorSurfaceRef.value?.focus({ preventScroll: true })
      }
    },
  })
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

tryOnUnmounted(() => {
  for (const element of dropElements.values()) {
    dropRegistry.unregisterDroppable(element)
  }
  dropElements.clear()
})
</script>

<template>
  <div ref="editorSurfaceRef" tabindex="-1" class="outline-none h-full">
    <ScrollArea ref="scrollAreaRef" class="h-full" :style="{ opacity: isPositioning ? 0 : 1 }">
      <div
        class="flex flex-col"
        data-visual-editor-content
        :style="{ minHeight: contentMinHeight }"
      >
        <div
          v-if="isSceneEmpty"
          :ref="value => registerDropTarget('empty', resolveHTMLElement(value), tailDropTarget)"
          data-visual-drop-slot="empty"
          class="flex flex-1 min-h-64 relative"
        >
          <Empty class="border-0 flex-1">
            <EmptyContent>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText />
                </EmptyMedia>
                <EmptyTitle>{{ $t('edit.visualEditor.emptyTitle') }}</EmptyTitle>
                <EmptyDescription>
                  {{ $t('edit.visualEditor.emptyDescription') }}
                </EmptyDescription>
              </EmptyHeader>
            </EmptyContent>
          </Empty>
          <div
            v-if="activeDropIndicator?.placement === 'tail'"
            data-visual-drop-indicator="empty"
            aria-hidden="true"
            :class="$style.dropEmptyIndicator"
          />
        </div>

        <div v-else ref="statementListRef" role="listbox" :aria-label="$t('edit.visualEditor.statementList')" :style="{ height: `${totalSize}px`, width: '100%', position: 'relative' }">
          <div
            v-for="row in renderedStatementRows"
            :key="row.key"
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
              class="relative"
            >
              <div
                :ref="value => registerDropTarget(row.insertDropKey, resolveHTMLElement(value), row.insertDropTarget)"
                :data-visual-drop-slot="row.insertDropSlot"
                class="inset-x-0 absolute z-10"
                :style="buildInsertDropStyle(row)"
              />

              <div
                :ref="value => registerDropTarget(`update:${row.statement.id}`, resolveHTMLElement(value), row.updateDropTarget)"
                class="relative"
              >
                <VisualEditorStatementCard
                  :collapsed="isStatementCollapsed(row.statement.id)"
                  :entry="row.statement"
                  :index="row.index"
                  :play-to-disabled="props.state.isDirty"
                  :selected="row.statement.id === selectedStatementId"
                  :readonly="statementReadonly"
                  :previous-speaker="previousSpeakers[row.index]"
                  @update="handleStatementUpdate"
                  @update:collapsed="val => handleCollapsedUpdate(row.statement.id, val)"
                  @select="handleSelect"
                  @delete="handleStatementDelete"
                  @play-to="handlePlayTo"
                />
              </div>

              <div
                v-if="(activeDropIndicator?.placement === 'head' && row.index === 0) || (activeDropIndicator?.placement === 'gap' && activeDropIndicator.insertIndex === row.index)"
                data-visual-drop-indicator="insert"
                aria-hidden="true"
                :class="[$style.dropInsertIndicator, $style.dropInsertIndicatorBefore]"
                :style="buildInsertIndicatorStyle(row)"
              />
              <div
                v-if="activeDropIndicator?.placement === 'update' && activeDropIndicator.statementId === row.statement.id"
                data-visual-drop-indicator="update"
                aria-hidden="true"
                :class="$style.dropUpdateIndicator"
              />
            </div>
          </div>
        </div>

        <div
          v-if="!isSceneEmpty"
          :ref="value => registerDropTarget('tail', resolveHTMLElement(value), tailDropTarget)"
          data-visual-drop-slot="tail"
          class="mx-2 flex-1 relative"
          :style="{
            flexBasis: tailDropAreaSize,
            minHeight: tailDropAreaSize,
            marginTop: tailDropAreaOffset,
          }"
        >
          <div
            v-if="activeDropIndicator?.placement === 'tail'"
            data-visual-drop-indicator="insert"
            aria-hidden="true"
            :class="[$style.dropInsertIndicator, $style.dropInsertIndicatorBefore]"
            :style="{ top: '12px' }"
          />
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

<style module>
.drop-insert-indicator {
  --drop-indicator-rgb: 14 165 233;

  position: absolute;
  right: 0.75rem;
  left: 0.75rem;
  z-index: 20;
  height: 0.5rem;
  pointer-events: none;
  background: rgb(var(--drop-indicator-rgb) / 14%);
  border-radius: 9999px;
}

.drop-insert-indicator::before {
  position: absolute;
  inset: 0.1875rem 0.5rem;
  content: "";
  background: rgb(var(--drop-indicator-rgb) / 86%);
  border-radius: inherit;
  box-shadow:
    0 0 0 1px rgb(var(--drop-indicator-rgb) / 22%),
    0 0 0.75rem rgb(var(--drop-indicator-rgb) / 26%);
}

.drop-insert-indicator-before {
  top: 0;
  transform: translateY(-50%);
}

.drop-update-indicator {
  --drop-indicator-rgb: 14 165 233;

  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(
      90deg,
      rgb(var(--drop-indicator-rgb) / 10%),
      rgb(var(--drop-indicator-rgb) / 5%)
    );
  border-radius: 0.5rem;
  box-shadow:
    inset 0 0 0 1px rgb(var(--drop-indicator-rgb) / 36%),
    0 0 0.75rem rgb(var(--drop-indicator-rgb) / 14%);
}

.drop-empty-indicator {
  --drop-indicator-rgb: 14 165 233;

  position: absolute;
  inset: 0.5rem;
  z-index: 20;
  pointer-events: none;
  background: rgb(var(--drop-indicator-rgb) / 8%);
  border: 1px dashed rgb(var(--drop-indicator-rgb) / 70%);
  border-radius: 0.5rem;
  box-shadow: inset 0 0 0 1px rgb(var(--drop-indicator-rgb) / 18%);
}

:global(.dark) .drop-insert-indicator,
:global(.dark) .drop-update-indicator,
:global(.dark) .drop-empty-indicator {
  --drop-indicator-rgb: 56 189 248;
}
</style>
