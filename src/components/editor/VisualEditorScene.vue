<script setup lang="ts">
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
  selectedStatementId,
  totalSize,
  virtualRows,
} = runtime

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

</script>

<template>
  <div ref="editorSurfaceRef" tabindex="-1" class="outline-none h-full">
    <ScrollArea ref="scrollAreaRef" class="h-full" :style="{ opacity: isPositioning ? 0 : 1 }">
      <div role="listbox" :aria-label="$t('edit.visualEditor.statementList')" :style="{ height: `${totalSize}px`, width: '100%', position: 'relative' }">
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
          <VisualEditorStatementCard
            :collapsed="isStatementCollapsed(props.state.statements[row.index].id)"
            :entry="props.state.statements[row.index]"
            :index="row.index"
            :play-to-disabled="props.state.isDirty"
            :selected="props.state.statements[row.index].id === selectedStatementId"
            :readonly="preferenceStore.showSidebar && editSettings.collapseStatementsOnSidebarOpen"
            :previous-speaker="previousSpeakers[row.index]"
            @update="handleStatementUpdate"
            @update:collapsed="val => handleCollapsedUpdate(props.state.statements[row.index].id, val)"
            @select="handleSelect"
            @delete="handleStatementDelete"
            @play-to="handlePlayTo"
          />
        </div>
      </div>
    </ScrollArea>
  </div>
</template>
