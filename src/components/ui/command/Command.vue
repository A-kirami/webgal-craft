<script setup lang="ts">
import type { ListboxRootEmits, ListboxRootProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { ListboxRoot, useFilter, useForwardPropsEmits } from "reka-ui"
import { onMounted, reactive, ref, watch } from "vue"
import { cn } from '~/lib/utils'
import { provideCommandContext } from "."

const props = withDefaults(defineProps<ListboxRootProps & { class?: HTMLAttributes["class"] }>(), {
  modelValue: "",
})

const emits = defineEmits<ListboxRootEmits>()

const delegatedProps = reactiveOmit(props, "class")

const forwarded = useForwardPropsEmits(delegatedProps, emits)

const allItems = ref<Map<string, string>>(new Map())
const allGroups = ref<Map<string, Set<string>>>(new Map())

const { contains } = useFilter({ sensitivity: "base" })
const filterState = reactive({
  search: "",
  filtered: {
    /** The count of all visible items. */
    count: 0,
    /** Map from visible item id to its search score. */
    items: new Map() as Map<string, number>,
    /** Set of groups with at least one visible item. */
    groups: new Set() as Set<string>,
  },
})

function filterItems() {
  if (!filterState.search) {
    filterState.filtered.count = allItems.value.size
    // Do nothing, each item will know to show itself because search is empty
    return
  }

  // Reset the groups
  filterState.filtered.groups = new Set()
  let itemCount = 0

  // Check which items should be included
  for (const [id, value] of allItems.value) {
    const score = contains(value, filterState.search)
    filterState.filtered.items.set(id, score ? 1 : 0)
    if (score)
      itemCount++
  }

  // Check which groups have at least 1 item shown
  for (const [groupId, group] of allGroups.value) {
    for (const itemId of group) {
      if (filterState.filtered.items.get(itemId)! > 0) {
        filterState.filtered.groups.add(groupId)
        break
      }
    }
  }

  filterState.filtered.count = itemCount
}

watch(() => filterState.search, () => {
  filterItems()
})

// Workaround: reka-ui ListboxRoot 在挂载时会自动高亮并聚焦第一个 item
// 参见 https://github.com/unovue/reka-ui/issues/2056
const listboxRef = ref<{ highlightedElement: HTMLElement | null }>()

function setHighlight(el: HTMLElement | null) {
  if (!listboxRef.value) return
  if (el) {
    listboxRef.value.highlightedElement = el
  }
  else {
    // 仅清除 DOM 属性和焦点，不设置 highlightedElement = null 以避免 patch 崩溃
    const current = listboxRef.value.highlightedElement
    if (current instanceof HTMLElement) {
      current.removeAttribute('data-highlighted')
      current.blur()
    }
  }
}

onMounted(() => {
  requestAnimationFrame(() => {
    // 仅通过 DOM 操作清除初始高亮，不修改内部响应式状态以避免 patch 崩溃
    const el = listboxRef.value?.highlightedElement
    if (el instanceof HTMLElement) {
      el.removeAttribute('data-highlighted')
      el.blur()
    }
  })
})

provideCommandContext({
  allItems,
  allGroups,
  filterState,
  setHighlight,
})
</script>

<template>
  <ListboxRoot
    ref="listboxRef"
    v-bind="forwarded"
    :class="cn('flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground', props.class)"
  >
    <slot />
  </ListboxRoot>
</template>
