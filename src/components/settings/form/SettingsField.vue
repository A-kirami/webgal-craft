<script setup lang="ts">
import { FormField } from '~/components/ui/form'

import FolderPickerField from './fields/FolderPickerField.vue'
import InputField from './fields/InputField.vue'
import NumberInputField from './fields/NumberInputField.vue'
import SelectField from './fields/SelectField.vue'
import SwitchField from './fields/SwitchField.vue'

import type { Component } from 'vue'
import type { SettingsFieldDef } from '~/features/settings/schema'

interface Props {
  name: string
  field: SettingsFieldDef
}

const props = defineProps<Props>()

const fieldComponentMap = {
  folderPicker: FolderPickerField,
  input: InputField,
  number: NumberInputField,
  select: SelectField,
  switch: SwitchField,
} satisfies Record<SettingsFieldDef['type'], Component>

const fieldComponent = $computed<Component>(() => fieldComponentMap[props.field.type])

function createFieldBindings(slotProps: {
  componentField?: object
  handleChange: (event: Event | unknown, shouldValidate?: boolean) => void
  value: unknown
}) {
  return {
    componentField: slotProps.componentField,
    field: props.field,
    handleChange: slotProps.handleChange,
    value: slotProps.value,
  }
}
</script>

<template>
  <FormField v-slot="slotProps" :name="name">
    <component :is="fieldComponent" v-bind="createFieldBindings(slotProps)" />
  </FormField>
</template>
