<script setup lang="ts">
import { useControlId } from '~/composables/useControlId'
import { StatementEditorSurface } from '~/features/editor/statement-editor/surface-context'

interface Props {
  surface: StatementEditorSurface
  items: { first: string, second: string }[]
  firstLabel: string
  secondLabel: string
  firstPlaceholder?: string
  secondPlaceholder?: string
  addLabel: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  updateFirst: [payload: { index: number, value: string }]
  updateSecond: [payload: { index: number, value: string }]
  remove: [index: number]
  add: []
}>()

const isInline = $computed(() => props.surface === 'inline')
const { buildControlId } = useControlId('pair-list')

interface PairListItem {
  first: string
  second: string
}

let nextKey = 0
let itemKeys: number[] = []

function areItemsEqual(left: PairListItem | undefined, right: PairListItem | undefined): boolean {
  return !!left && !!right && left.first === right.first && left.second === right.second
}

function allocateKey(): number {
  return nextKey++
}

function resolveItemKeys(items: PairListItem[], oldItems: PairListItem[] | undefined): number[] {
  if (itemKeys.length === items.length) {
    return [...itemKeys]
  }

  if (!oldItems || itemKeys.length === 0) {
    return items.map(() => allocateKey())
  }

  const previousKeys = itemKeys
  const nextKeys = Array.from({ length: items.length }, () => -1)
  const maxComparableLength = Math.min(items.length, oldItems.length)

  let prefixLength = 0
  while (
    prefixLength < maxComparableLength
    && areItemsEqual(items[prefixLength], oldItems[prefixLength])
  ) {
    nextKeys[prefixLength] = previousKeys[prefixLength] ?? allocateKey()
    prefixLength++
  }

  let suffixLength = 0
  while (
    suffixLength < maxComparableLength - prefixLength
    && areItemsEqual(
      items[items.length - 1 - suffixLength],
      oldItems[oldItems.length - 1 - suffixLength],
    )
  ) {
    nextKeys[items.length - 1 - suffixLength] = previousKeys[oldItems.length - 1 - suffixLength] ?? allocateKey()
    suffixLength++
  }

  const editableLength = items.length - suffixLength
  for (let i = prefixLength; i < editableLength; i++) {
    nextKeys[i] = items.length === oldItems.length
      ? (previousKeys[i] ?? allocateKey())
      : allocateKey()
  }

  return nextKeys
}

watch(() => props.items, (items, oldItems) => {
  itemKeys = resolveItemKeys(items, oldItems)
}, { immediate: true })

function itemKey(index: number): number {
  return itemKeys[index] ?? index
}

function handleAdd(): void {
  itemKeys = [...itemKeys, allocateKey()]
  emit('add')
}

function handleRemove(index: number): void {
  const nextKeys = [...itemKeys]
  nextKeys.splice(index, 1)
  itemKeys = nextKeys
  emit('remove', index)
}

function firstInputId(index: number): string {
  return buildControlId(`first-${index}`)
}

function secondInputId(index: number): string {
  return buildControlId(`second-${index}`)
}
</script>

<template>
  <div
    class="group flex flex-col gap-1.5 w-full data-[surface=panel]:gap-2.5 data-[surface=panel]:w-auto"
    :data-surface="props.surface"
  >
    <div
      v-for="(item, i) in items"
      :key="itemKey(i)"
      class="flex gap-1.5 items-center group-data-[surface=panel]:p-3 group-data-[surface=panel]:border group-data-[surface=panel]:rounded-md group-data-[surface=panel]:flex-col group-data-[surface=panel]:gap-2 group-data-[surface=panel]:items-stretch"
    >
      <template v-if="isInline">
        <Input
          :model-value="item.first"
          :placeholder="firstPlaceholder"
          class="text-xs px-2.5 flex-1 h-6 min-w-20 shadow-none"
          @update:model-value="emit('updateFirst', { index: i, value: String($event) })"
        />
        <div class="i-lucide-arrow-right text-muted-foreground shrink-0 size-3.5" />
        <slot name="second-field" :item="item" :index="i">
          <Input
            :model-value="item.second"
            :placeholder="secondPlaceholder"
            class="text-xs px-2.5 flex-1 h-6 shadow-none"
            @update:model-value="emit('updateSecond', { index: i, value: String($event) })"
          />
        </slot>
        <Button
          variant="ghost"
          size="sm"
          class="text-xs text-muted-foreground px-1.5 shrink-0 h-6 hover:text-destructive"
          @click="handleRemove(i)"
        >
          <div class="i-lucide-x size-3.5" />
        </Button>
      </template>
      <template v-else>
        <div class="flex flex-col gap-1">
          <div class="flex items-center">
            <Label
              :for="firstInputId(i)"
              class="text-xs text-muted-foreground font-medium w-fit"
            >
              {{ firstLabel }}
            </Label>
            <Button
              variant="ghost"
              size="sm"
              class="text-muted-foreground ml-auto p-1 size-6 hover:text-destructive"
              @click="handleRemove(i)"
            >
              <div class="i-lucide-x size-3.5" />
            </Button>
          </div>
          <Input
            :id="firstInputId(i)"
            :model-value="item.first"
            class="text-xs h-7 shadow-none"
            @update:model-value="emit('updateFirst', { index: i, value: String($event) })"
          />
        </div>
        <div class="flex flex-col gap-1">
          <Label
            :for="secondInputId(i)"
            class="text-xs text-muted-foreground font-medium w-fit"
          >
            {{ secondLabel }}
          </Label>
          <slot
            name="second-field-panel"
            :item="item"
            :index="i"
            :input-id="secondInputId(i)"
          >
            <Input
              :id="secondInputId(i)"
              :model-value="item.second"
              class="text-xs h-7 shadow-none"
              @update:model-value="emit('updateSecond', { index: i, value: String($event) })"
            />
          </slot>
        </div>
      </template>
    </div>
    <Button
      variant="outline"
      size="sm"
      class="text-xs h-6 w-full shadow-none group-data-[surface=panel]:h-7"
      @click="handleAdd"
    >
      <div class="i-lucide-plus mr-1 size-3.5" />
      {{ addLabel }}
    </Button>
  </div>
</template>
