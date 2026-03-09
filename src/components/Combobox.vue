<script setup lang="ts">
import { cn } from '~/lib/utils'

import type { HTMLAttributes } from 'vue'

const props = defineProps<{
  class?: HTMLAttributes['class']
  modelValue?: string
  options: { label: string, value: string }[]
  placeholder?: string
  searchPlaceholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

let open = $ref(false)
const scrollAreaRef = $(useTemplateRef('scrollAreaRef'))

function scrollToSelectedOption() {
  const viewport = scrollAreaRef?.viewport?.viewportElement
  if (!viewport) {
    return
  }
  const selected = viewport.querySelector('[role="option"][data-selected]') as HTMLElement | null
  if (!selected) {
    return
  }
  const viewportRect = viewport.getBoundingClientRect()
  const selectedRect = selected.getBoundingClientRect()
  if (selectedRect.top < viewportRect.top || selectedRect.bottom > viewportRect.bottom) {
    selected.scrollIntoView({ block: 'center', behavior: 'auto' })
  }
}

watch(() => open, async (val) => {
  if (!val) {
    return
  }
  await nextTick()
  requestAnimationFrame(scrollToSelectedOption)
})

const displayLabel = $computed(() => {
  if (!props.modelValue) {
    return ''
  }
  const opt = props.options.find(o => o.value === props.modelValue)
  return opt ? opt.label : props.modelValue
})
</script>

<template>
  <Popover ::open="open">
    <PopoverTrigger as-child>
      <Button
        variant="outline"
        role="combobox"
        :class="cn('text-xs shadow-none justify-between font-normal px-2 py-1.5', props.class)"
      >
        <span class="truncate" :class="!displayLabel && 'text-muted-foreground'">{{ displayLabel || placeholder }}</span>
        <div class="i-lucide-chevrons-up-down ml-1 opacity-50 shrink-0 size-3" />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="p-0 min-w-[--reka-popover-trigger-width] w-auto">
      <Command class="grid grid-rows-[auto_1fr]">
        <CommandInput
          :placeholder="searchPlaceholder"
          class="text-xs h-8"
        />
        <ScrollArea ref="scrollAreaRef" class="max-h-40vh" type="auto">
          <CommandList class="max-h-initial">
            <CommandEmpty class="text-sm text-muted-foreground py-6 text-center">
              {{ $t('edit.visualEditor.noResults') }}
            </CommandEmpty>
            <CommandGroup>
              <CommandItem
                v-for="opt in options"
                :key="opt.value"
                :value="opt.label"
                class="text-xs gap-2"
                :data-selected="modelValue === opt.value || undefined"
                @select="emit('update:modelValue', opt.value); open = false"
              >
                <div class="i-lucide-check size-3.5" :class="modelValue === opt.value ? 'opacity-100' : 'opacity-0'" />
                {{ opt.label }}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </ScrollArea>
      </Command>
    </PopoverContent>
  </Popover>
</template>
