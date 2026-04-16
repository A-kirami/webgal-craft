<script setup lang="ts">
import { cn } from '~/lib/utils'

import type { ComponentPublicInstance } from 'vue'
import type { CascadingComboboxNode } from '~/lib/cascading-combobox'

defineOptions({
  name: 'CascadingBrowseLayer',
})

const HOVER_OPEN_DELAY_MS = 60

const props = withDefaults(defineProps<{
  expandedGroupPath: string[]
  highlightedPath: string[]
  layerPath?: string[]
  menuOpen?: boolean
  modelValue?: string
  nodes: CascadingComboboxNode[]
  preferredSubpanelSide?: 'left' | 'right'
  scrollRequestKey?: number
  scrollRequestTargetDepth?: number | 'all'
}>(), {
  layerPath: () => [],
  menuOpen: true,
  preferredSubpanelSide: 'right',
  scrollRequestKey: 0,
  scrollRequestTargetDepth: 'all',
})

const emit = defineEmits<{
  expandGroup: [nodeId: string]
  enterGroup: [nodeId: string]
  highlightNode: [nodeId: string]
  previewGroup: [nodeId: string]
  selectItem: [value: string]
}>()

const activeNodeId = computed(() => props.highlightedPath.at(props.layerPath.length))
const expandedNodeId = computed(() => props.expandedGroupPath.at(props.layerPath.length))
const layerDepth = computed(() => props.layerPath.length)
const nodeElementMap = shallowReactive(new Map<string, HTMLElement>())
let hoverOpenTimer: ReturnType<typeof setTimeout> | undefined

function clearHoverOpenTimer() {
  if (!hoverOpenTimer) {
    return
  }

  clearTimeout(hoverOpenTimer)
  hoverOpenTimer = undefined
}

function isNodeExpanded(nodeId: string): boolean {
  return expandedNodeId.value === nodeId
}

function getAnchorReference(nodeId: string): HTMLElement | undefined {
  return nodeElementMap.get(nodeId)
}

function setNodeElement(nodeId: string) {
  return (element: Element | ComponentPublicInstance | null) => {
    if (element instanceof HTMLElement) {
      nodeElementMap.set(nodeId, element)
      return
    }

    nodeElementMap.delete(nodeId)
  }
}

function handleNodePointerEnter(node: CascadingComboboxNode) {
  clearHoverOpenTimer()

  if (node.kind === 'group') {
    emit('previewGroup', node.id)

    hoverOpenTimer = setTimeout(() => {
      emit('expandGroup', node.id)
    }, HOVER_OPEN_DELAY_MS)
    return
  }

  emit('highlightNode', node.id)
}

function handlePrimaryAction(node: CascadingComboboxNode) {
  clearHoverOpenTimer()

  if (node.kind === 'group') {
    emit('highlightNode', node.id)
    emit('enterGroup', node.id)
    return
  }

  emit('selectItem', node.value)
}

function centerElementInScrollContainer(
  element: HTMLElement | undefined,
  scrollContainer: HTMLElement | null | undefined,
) {
  if (!element || !scrollContainer) {
    return
  }

  const elementRect = element.getBoundingClientRect()
  const containerRect = scrollContainer.getBoundingClientRect()
  const offsetWithinContainer = elementRect.top - containerRect.top
  const nextScrollTop = scrollContainer.scrollTop
    + offsetWithinContainer
    - (scrollContainer.clientHeight - elementRect.height) / 2

  scrollContainer.scrollTop = Math.max(0, nextScrollTop)
}

function centerActiveNodeInLayer() {
  const activeElement = activeNodeId.value
    ? nodeElementMap.get(activeNodeId.value)
    : [...nodeElementMap.values()].find(element => element.dataset.selectedBrowseItem === 'true')
  const scrollContainer = activeElement?.closest<HTMLElement>(
    '[data-cascading-root-scroll-viewport], [data-cascading-subpanel-scroll-viewport]',
  )

  centerElementInScrollContainer(activeElement, scrollContainer)
}

watch(
  () => [props.menuOpen, props.scrollRequestKey, props.scrollRequestTargetDepth] as const,
  ([menuOpen, , scrollRequestTargetDepth]) => {
    if (!menuOpen) {
      return
    }

    if (scrollRequestTargetDepth !== 'all' && scrollRequestTargetDepth !== layerDepth.value) {
      return
    }

    nextTick(() => {
      requestAnimationFrame(() => {
        centerActiveNodeInLayer()
      })
    })
  },
  {
    flush: 'post',
    immediate: true,
  },
)

onBeforeUnmount(() => {
  clearHoverOpenTimer()
})
</script>

<template>
  <ul
    data-cascading-browse-layer=""
    class="text-xs m-0 p-0 list-none w-full"
    @mouseleave="clearHoverOpenTimer"
  >
    <li v-for="node in props.nodes" :key="node.id" class="list-none w-full">
      <button
        :ref="setNodeElement(node.id)"
        type="button"
        :data-node-id="node.id"
        :data-active-browse="activeNodeId === node.id ? 'true' : undefined"
        :data-selected-browse-item="node.kind === 'item' && props.modelValue === node.value ? 'true' : undefined"
        :class="cn(
          'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs',
          activeNodeId === node.id && 'bg-muted',
          node.kind === 'item' && props.modelValue === node.value && 'font-medium',
        )"
        @mouseenter="handleNodePointerEnter(node)"
        @click="handlePrimaryAction(node)"
      >
        <div v-if="node.kind === 'item'" class="i-lucide-check shrink-0 size-3.5" :class="props.modelValue === node.value ? 'opacity-100' : 'opacity-0'" />
        <div v-else class="shrink-0 size-3.5" />
        <span class="flex-1 min-w-0 truncate">{{ node.label }}</span>
        <div v-if="node.kind === 'group'" class="i-lucide-chevron-right opacity-60 shrink-0 size-3" />
      </button>

      <FloatingSubpanel
        v-if="node.kind === 'group'"
        :anchor-element="getAnchorReference(node.id)"
        :open="props.menuOpen && isNodeExpanded(node.id)"
        :side="props.preferredSubpanelSide"
        :data-layer-depth="props.layerPath.length + 1"
      >
        <template #default="{ placedSide }">
          <CascadingBrowseLayer
            :nodes="node.children"
            :layer-path="[...props.layerPath, node.id]"
            :menu-open="props.menuOpen"
            :highlighted-path="props.highlightedPath"
            :expanded-group-path="props.expandedGroupPath"
            :model-value="props.modelValue"
            :preferred-subpanel-side="placedSide"
            :scroll-request-key="props.scrollRequestKey"
            :scroll-request-target-depth="props.scrollRequestTargetDepth"
            @expand-group="emit('expandGroup', $event)"
            @highlight-node="emit('highlightNode', $event)"
            @preview-group="emit('previewGroup', $event)"
            @enter-group="emit('enterGroup', $event)"
            @select-item="emit('selectItem', $event)"
          />
        </template>
      </FloatingSubpanel>
    </li>
  </ul>
</template>
