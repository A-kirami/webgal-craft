<script setup lang="ts">
import { FileText, Pencil, Trash } from '@lucide/vue'
import { Handle, Position } from '@vue-flow/core'

import { RelPath } from '~/domain/path'
import { FLOWCHART_NODE_CONTEXT_KEY } from '~/features/editor/flowchart/flowchart-node-view'
import { SCENE_FILE_EXTENSIONS } from '~/features/editor/flowchart/flowchart-scene'

import type { NodeProps } from '@vue-flow/core'
import type { FlowchartNodeViewData } from '~/features/editor/flowchart/flowchart-node-view'

const props = defineProps<NodeProps<FlowchartNodeViewData>>()

const injectedContext = inject(FLOWCHART_NODE_CONTEXT_KEY)
if (!injectedContext) {
  throw new Error('流程图节点缺少编辑会话上下文')
}
const nodeContext = injectedContext

const titleInputRef = useTemplateRef<HTMLInputElement>('titleInputRef')
let draftTitle = $ref('')

const isEditingTitle = computed(() => nodeContext.isTitleEditing(props.id))
const isSceneDropTarget = $computed(() => nodeContext.isSceneDropTarget(props.id))
const sceneName = $computed(() => {
  const scene = props.data.scene
  return scene ? scene.split('/').at(-1) : undefined
})

watch(isEditingTitle, (editing) => {
  if (!editing) {
    return
  }

  draftTitle = props.data.title
  void nextTick(() => {
    titleInputRef.value?.focus()
    titleInputRef.value?.select()
  })
}, { immediate: true })

function commitTitle() {
  const nextTitle = draftTitle.trim()
  if (!nextTitle) {
    nodeContext.cancelTitleEdit()
    return
  }

  nodeContext.commitTitle(props.id, nextTitle)
}

function handleSceneChange(value: string) {
  if (!value) {
    return
  }

  nodeContext.selectScene(props.id, RelPath.from(value))
}
</script>

<template>
  <div
    :data-flowchart-node-id="props.id"
    :data-tour="props.data.isRoot ? 'flowchart-node' : undefined"
    :data-show-actions="props.selected && nodeContext.isOnlySelectedNode(props.id) || undefined"
    :data-dragging="props.dragging || undefined"
    class="text-card-foreground border rounded-lg flex flex-col w-56 shadow-sm transition-colors relative"
    :class="[
      $style.node,
      props.selected || isSceneDropTarget ? 'border-primary ring-2 ring-primary/25' : 'border-border',
      isSceneDropTarget ? 'bg-primary/10' : 'bg-card',
    ]"
  >
    <Handle type="target" :position="Position.Top" class="border-2 border-card bg-muted-foreground! size-2.5!" />

    <div
      class="nodrag nopan nowheel pb-1.5 bottom-full right-0 absolute z-10"
      :class="$style.actions"
      data-flowchart-node-actions
      @mousedown.stop
      @click.stop
      @dblclick.stop
    >
      <div class="p-0.5 border rounded-md bg-popover flex gap-0.5 shadow-md">
        <Button
          variant="ghost"
          size="icon-xs"
          class="text-muted-foreground"
          :aria-label="$t('edit.flowchart.node.rename')"
          @click="nodeContext.beginTitleEdit(props.id)"
        >
          <Pencil />
        </Button>
        <Button
          v-if="!props.data.isRoot"
          variant="ghost"
          size="icon-xs"
          class="text-muted-foreground hover:text-destructive"
          :aria-label="$t('edit.flowchart.node.delete')"
          @click="nodeContext.deleteNode(props.id)"
        >
          <Trash />
        </Button>
      </div>
    </div>

    <div
      class="px-3 py-0.5 border-b rounded-t-lg flex gap-1.5 min-h-8 cursor-grab select-none items-center active:cursor-grabbing"
      :class="props.data.isRoot ? 'border-primary/15 bg-primary/5' : 'border-border/60 bg-muted/40'"
      data-flowchart-node-header
    >
      <span
        v-if="props.data.isRoot"
        class="text-[10px] text-primary-foreground leading-none font-medium px-1.5 py-0.5 border border-primary rounded bg-primary shrink-0"
      >
        {{ $t('edit.flowchart.node.rootBadge') }}
      </span>
      <input
        v-if="isEditingTitle"
        ref="titleInputRef"
        v-model="draftTitle"
        type="text"
        class="nodrag nowheel text-sm px-1 outline-none border border-primary/40 rounded bg-background h-6 min-w-0 w-full -mx-1"
        :aria-label="$t('edit.flowchart.node.titleInputLabel')"
        @blur="commitTitle"
        @keydown.enter.prevent="commitTitle"
        @keydown.esc.prevent="nodeContext.cancelTitleEdit()"
      >
      <button
        v-else
        type="button"
        class="text-sm font-medium text-left rounded flex-1 min-w-0 cursor-inherit truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        :title="$t('edit.flowchart.node.editTitle')"
        @dblclick.stop="nodeContext.beginTitleEdit(props.id)"
        @keydown.enter.prevent="nodeContext.beginTitleEdit(props.id)"
        @keydown.space.prevent="nodeContext.beginTitleEdit(props.id)"
      >
        {{ props.data.title }}
      </button>
    </div>

    <div class="px-3 py-2">
      <FilePicker
        :model-value="props.data.scene ?? ''"
        :root-path="nodeContext.sceneRootPath"
        :extensions="[...SCENE_FILE_EXTENSIONS]"
        :popover-title="$t('edit.flowchart.node.scenePickerTitle')"
        history-scope-key="flowchart-node-scene"
        @update:model-value="handleSceneChange"
      >
        <template #trigger>
          <button
            type="button"
            class="nodrag nowheel text-xs px-1.5 py-1 text-left border rounded border-dashed flex gap-1 w-full transition-colors items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :class="sceneName
              ? 'text-foreground border-border/70 hover:border-primary/50 hover:bg-muted/50'
              : 'text-muted-foreground border-border/70 hover:border-primary/50 hover:bg-muted/50'"
            :title="props.data.scene ?? $t('edit.flowchart.node.bindScene')"
          >
            <FileText class="shrink-0 size-3.5" aria-hidden="true" />
            <span class="truncate">
              {{ sceneName ?? $t('edit.flowchart.node.unboundScene') }}
            </span>
            <span class="sr-only">
              {{ sceneName ? $t('edit.flowchart.node.replaceScene') : $t('edit.flowchart.node.bindScene') }}
            </span>
          </button>
        </template>
      </FilePicker>
    </div>

    <Handle
      type="source"
      :position="Position.Bottom"
      class="border-2 border-card bg-muted-foreground! size-2.5!"
      :data-tour="props.data.isRoot ? 'flowchart-source' : undefined"
    />
  </div>
</template>

<style module>
.actions {
  pointer-events: none;
  opacity: 0;
}

.node:not([data-dragging]):hover .actions,
.node:not([data-dragging]):has(:focus-visible) .actions,
.node:not([data-dragging])[data-show-actions] .actions {
  pointer-events: auto;
  opacity: 1;
}
</style>
