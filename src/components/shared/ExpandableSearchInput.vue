<script setup lang="ts">
import { Search, X } from '@lucide/vue'

import { cn } from '~/lib/utils'

import type { HTMLAttributes } from 'vue'

interface Props {
  clearLabel?: string
  disabled?: boolean
  expandedWidthClass?: string
  inputClass?: HTMLAttributes['class']
  placeholder?: string
  toggleLabel?: string
}

const {
  clearLabel,
  disabled = false,
  expandedWidthClass = 'w-44',
  inputClass,
  placeholder,
  toggleLabel,
} = defineProps<Props>()

const { t } = useI18n()

let modelValue = $(defineModel<string>({ default: '' }))

let isExpanded = $ref(false)

const isInputVisible = $computed(() => isExpanded || !!modelValue)
const resolvedClearLabel = $computed(() => clearLabel ?? t('common.search.clear'))
const resolvedPlaceholder = $computed(() => placeholder ?? t('common.search.placeholder'))
const resolvedToggleLabel = $computed(() => toggleLabel ?? t('common.search.toggle'))
const inputRef = useTemplateRef('inputRef')

async function handleToggle() {
  if (isInputVisible) {
    modelValue = ''
    isExpanded = false
    return
  }

  isExpanded = true
  await nextTick()
  inputRef.value?.$el?.focus()
}

async function handleClearInput() {
  modelValue = ''
  await nextTick()
  inputRef.value?.$el?.focus()
}
</script>

<template>
  <div class="flex shrink-0 gap-1.5 items-center">
    <InputGroup
      :class="cn(
        'transition-all duration-200 ease-out h-7',
        isInputVisible ? `${expandedWidthClass} opacity-100` : 'w-0 opacity-0 border-transparent pointer-events-none',
      )"
    >
      <InputGroupInput
        ref="inputRef"
        ::="modelValue"
        type="search"
        :disabled="disabled"
        :placeholder="resolvedPlaceholder"
        :aria-label="resolvedPlaceholder"
        :class="cn('text-xs shadow-none', inputClass)"
      />
      <InputGroupAddon v-if="modelValue" align="inline-end">
        <InputGroupButton
          class="size-5"
          :disabled="disabled"
          :aria-label="resolvedClearLabel"
          @click.prevent="handleClearInput"
        >
          <X class="size-4" aria-hidden="true" />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
    <Button
      :disabled="disabled"
      :variant="isInputVisible ? 'default' : 'outline'"
      size="icon"
      class="shrink-0 size-7 shadow-none"
      :title="resolvedToggleLabel"
      :aria-label="resolvedToggleLabel"
      @click="handleToggle"
    >
      <Search class="size-3.5" />
    </Button>
  </div>
</template>
