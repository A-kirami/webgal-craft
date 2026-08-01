<script setup lang="ts">
import Autocomplete from '~/components/primitives/Autocomplete.vue'
import { inputClass } from '~/components/ui/input'
import { cn } from '~/lib/utils'

import type { HTMLAttributes } from 'vue'
import type { ComponentProps } from '~/types/index'

type AutocompleteProps = ComponentProps<typeof Autocomplete>

defineOptions({
  inheritAttrs: false,
})

const props = defineProps<{
  class?: HTMLAttributes['class']
  id?: AutocompleteProps['id']
  options: AutocompleteProps['options']
  placeholder?: AutocompleteProps['placeholder']
}>()

const modelValue = defineModel<string>({ default: '' })
const root = useTemplateRef<HTMLElement>('root')
const inputGroupReference = computed(() => {
  return root.value?.closest<HTMLElement>('[data-slot="input-group"]') ?? undefined
})
</script>

<template>
  <div ref="root" class="flex-1 min-w-0">
    <Autocomplete
      v-bind="$attrs"
      :id="props.id"
      v-model="modelValue"
      :content-reference="inputGroupReference"
      :options="props.options"
      :placeholder="props.placeholder"
      :show-indicator="false"
      data-slot="input-group-control"
      container-class="w-full"
      :class="cn(
        inputClass,
        'rounded-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-transparent ring-offset-transparent dark:bg-transparent',
        props.class,
      )"
    />
  </div>
</template>
