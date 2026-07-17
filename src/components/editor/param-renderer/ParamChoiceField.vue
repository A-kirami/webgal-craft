<script setup lang="ts">
import { normalizeFieldStringValue } from '~/features/editor/statement-editor/field-utils'
import { cn } from '~/lib/utils'

import type { ParamSelectOptionItem } from './controls/types'
import type { CascadingComboboxData } from '~/components/primitives/combobox/cascading-combobox-data'

interface Props {
  comboboxData?: CascadingComboboxData
  controlClass?: string
  inputId: string
  mode: 'select' | 'combobox'
  notSelectedLabel: string
  options: ParamSelectOptionItem[]
  placeholder: string
  renderSegmented: boolean
  selectValue: string
}

defineProps<Props>()

const emit = defineEmits<{
  updateSelect: [value: string]
}>()

function emitSelect(value: unknown) {
  emit('updateSelect', normalizeFieldStringValue(value))
}
</script>

<template>
  <template v-if="mode === 'select' && renderSegmented">
    <SegmentedControl
      :id="inputId"
      :class="controlClass"
      :options="options"
      :select-value="selectValue"
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
    </SelectContent>
  </Select>

  <CascadingCombobox
    v-else-if="comboboxData"
    :id="inputId"
    :model-value="selectValue"
    :browse-nodes="comboboxData.browseNodes"
    :search-documents="comboboxData.searchDocuments"
    :placeholder="notSelectedLabel"
    :search-placeholder="placeholder || notSelectedLabel"
    :class="cn('px-2.5 h-6 min-w-24 group-data-[surface=panel]:px-3 group-data-[surface=panel]:h-7', controlClass)"
    @update:model-value="emitSelect"
  />

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
</template>
