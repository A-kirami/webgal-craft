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
    <SelectTrigger :id="inputId" :class="cn('text-xs h-6 min-w-18 px-2 [&_svg]:size-3.5 group-data-[surface=panel]:h-7 group-data-[surface=panel]:px-2.5', controlClass)">
      <SelectValue :placeholder="notSelectedLabel" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem
        v-for="opt in options"
        :key="opt.value"
        class="py-1.25 text-xs!"
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
    :class="cn('h-6 min-w-24 group-data-[surface=panel]:px-2.5 group-data-[surface=panel]:h-7', controlClass)"
    @update:model-value="emitSelect"
  />

  <Combobox
    v-else
    :id="inputId"
    :model-value="selectValue"
    :options="options"
    :placeholder="notSelectedLabel"
    :search-placeholder="placeholder || notSelectedLabel"
    :class="cn('h-6 min-w-24 group-data-[surface=panel]:px-2.5 group-data-[surface=panel]:h-7', controlClass)"
    @update:model-value="emitSelect"
  />
</template>
