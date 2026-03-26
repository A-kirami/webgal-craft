<script setup lang="ts">
import { CUSTOM_CONTENT, EditorField } from '~/helper/command-registry/schema'
import { normalizeFieldStringValue } from '~/helper/statement-editor/field-utils'
import { cn } from '~/lib/utils'

import SegmentedControl from './controls/SegmentedControl.vue'

import type { ParamSelectOptionItem } from './controls/types'
import type { StatementEditorSurface } from '~/helper/statement-editor/surface-context'

interface Props {
  controlClass?: string
  customInputId: string
  customLabel?: string
  customOptionLabel: string
  field: EditorField
  inputId: string
  isCustomField: boolean
  mode: 'select' | 'combobox'
  notSelectedLabel: string
  options: ParamSelectOptionItem[]
  placeholder: string
  renderSegmented: boolean
  selectValue: string
  surface: StatementEditorSurface
  value: string | number | boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  updateSelect: [value: string]
  updateValue: [value: string]
}>()

const isCustomizable = $computed(() => {
  return props.field.field.type === 'choice'
    && props.field.field.customizable === true
})

function emitSelect(value: unknown) {
  emit('updateSelect', normalizeFieldStringValue(value))
}

function emitValue(value: unknown) {
  emit('updateValue', normalizeFieldStringValue(value))
}
</script>

<template>
  <template v-if="mode === 'select' && renderSegmented">
    <SegmentedControl
      :id="inputId"
      :class="controlClass"
      :customizable="isCustomizable"
      :options="options"
      :select-value="selectValue"
      :custom-option-label="customOptionLabel"
      @update-select="emitSelect"
    />
  </template>

  <Select
    v-else-if="mode === 'select'"
    :model-value="selectValue"
    @update:model-value="emitSelect"
  >
    <SelectTrigger :id="inputId" :class="cn('text-xs h-6 px-2.5 shadow-none group-data-[surface=panel]:h-7 group-data-[surface=panel]:px-3', controlClass)">
      <SelectValue :placeholder="notSelectedLabel" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem
        v-for="opt in options"
        :key="opt.value"
        class="py-1.25 text-xs! group-data-[surface=panel]:py-1.5"
        :value="opt.value"
      >
        {{ opt.label }}
      </SelectItem>
      <SelectItem
        v-if="isCustomizable"
        class="py-1.25 text-xs! group-data-[surface=panel]:py-1.5"
        :value="CUSTOM_CONTENT"
      >
        {{ customOptionLabel }}
      </SelectItem>
    </SelectContent>
  </Select>

  <Combobox
    v-else
    :id="inputId"
    :model-value="selectValue"
    :options="options"
    :placeholder="notSelectedLabel"
    :search-placeholder="placeholder || notSelectedLabel"
    :class="cn('px-2.5 h-6 min-w-24 group-data-[surface=panel]:px-3 group-data-[surface=panel]:h-7', controlClass)"
    @update:model-value="emitSelect"
  />

  <div
    v-if="isCustomField"
    :class="cn('group flex gap-1.5 w-auto max-w-full min-w-0 flex-row items-center data-[surface=panel]:w-full data-[surface=panel]:flex-col data-[surface=panel]:gap-1 data-[surface=panel]:items-stretch')"
    :data-surface="surface"
  >
    <Label
      v-if="customLabel"
      :for="customInputId"
      :class="cn(
        'text-xs text-muted-foreground w-fit shrink-0',
        'group-data-[surface=panel]:font-medium',
      )"
    >
      {{ customLabel }}
    </Label>
    <Input
      :id="customInputId"
      :model-value="String(value ?? '')"
      :class="cn(
        controlClass,
        'text-xs h-6 px-2.5 w-24 shadow-none',
        'field-sizing-content w-auto max-w-full min-w-24 group-data-[surface=panel]:w-full',
        'group-data-[surface=panel]:h-7 group-data-[surface=panel]:px-3',
      )"
      @update:model-value="emitValue"
    />
  </div>
</template>
