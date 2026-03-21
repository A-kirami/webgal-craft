<script setup lang="ts">
import type { ScrollArea } from '~/components/ui/scroll-area'

interface Props {
  state: SceneVisualProjectionState
}

const props = defineProps<Props>()

const editSettings = useEditSettingsStore()
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

</script>

<template>
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
</template>
