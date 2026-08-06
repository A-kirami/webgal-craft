<script setup lang="ts">
import StatementPairListEditor from '~/components/editor/StatementPairListEditor.vue'

import type { arg } from 'webgal-parser/src/interface/sceneInterface'
import type { StatementEditorSurface } from '~/features/editor/statement-editor/surface-context'

const props = defineProps<{
  surface: StatementEditorSurface
  parameters: readonly arg[]
}>()

const emit = defineEmits<{
  update: [parameters: arg[]]
}>()

const parameterPairItems = $computed(() => props.parameters.map(parameter => ({
  first: parameter.key,
  second: String(parameter.value ?? ''),
})))

function updateParameter(index: number, patch: Partial<arg>): void {
  emit('update', props.parameters.map((parameter, currentIndex) =>
    currentIndex === index ? { ...parameter, ...patch } : { ...parameter },
  ))
}

function updateParameterKey(payload: { index: number, value: string }): void {
  updateParameter(payload.index, { key: payload.value })
}

function updateParameterValue(payload: { index: number, value: string }): void {
  updateParameter(payload.index, { value: payload.value })
}

function addParameter(): void {
  emit('update', [...props.parameters.map(parameter => ({ ...parameter })), { key: '', value: '' }])
}

function removeParameter(index: number): void {
  emit('update', props.parameters.filter((_, currentIndex) => currentIndex !== index).map(parameter => ({ ...parameter })))
}
</script>

<template>
  <StatementPairListEditor
    :surface="props.surface"
    :items="parameterPairItems"
    :first-label="$t('edit.visualEditor.params.parameterKey')"
    :second-label="$t('edit.visualEditor.params.parameterValue')"
    :first-placeholder="$t('edit.visualEditor.params.parameterKey')"
    :second-placeholder="$t('edit.visualEditor.params.parameterValue')"
    :add-label="$t('edit.visualEditor.params.addParameter')"
    separator="equals"
    @update-first="updateParameterKey"
    @update-second="updateParameterValue"
    @remove="removeParameter"
    @add="addParameter"
  />
</template>
