<script setup lang="ts">
import { useControlId } from '~/composables/useControlId'
import { EditorField, FileFieldConfig, I18nLike, resolveI18n, resolveSurfaceVariant } from '~/helper/command-registry/schema'
import { normalizeFieldStringValue } from '~/helper/statement-editor/field-utils'
import { statementEditorSurfaceKey } from '~/helper/statement-editor/surface-context'
import { cn } from '~/lib/utils'

import FocusXYControl from './controls/FocusXYControl.vue'
import NumberControl from './controls/NumberControl.vue'
import ParamChoiceField from './ParamChoiceField.vue'
import { useParamCustomField } from './useParamCustomField'
import { useParamFieldMeta } from './useParamFieldMeta'
import { useParamXyPad } from './useParamXyPad'

import type { ParamSelectOptionItem } from './controls/types'
import type { StatementSchemaParamMode } from './useParamFieldMeta'
import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { NumberField } from '~/helper/command-registry/schema'

interface Props {
  canScrub: (field: EditorField) => boolean
  customOptionLabel?: string
  fields: EditorField[]
  fileRootPaths: Record<string, string>
  getDynamicOptions: (field: EditorField) => { label: string, value: string }[]
  getFieldSelectValue: (field: EditorField) => string
  getFieldValue: (field: EditorField) => string | number | boolean
  isFieldFileMissing: (field: EditorField) => boolean
  isFieldCustom: (field: EditorField) => boolean
  isFieldVisible: (field: EditorField) => boolean
  mode?: StatementSchemaParamMode
  parsed?: ISentence
}

const props = withDefaults(defineProps<Props>(), {
  customOptionLabel: '',
  mode: 'all',
})

const emit = defineEmits<{
  commitSlider: [item: { event: Event, field: EditorField }]
  labelPointerDown: [item: { event: PointerEvent, field: EditorField }]
  updateSelect: [item: { field: EditorField, value: string }]
  updateValue: [item: { field: EditorField, value: string | number | boolean }]
}>()

const { t } = useI18n()
const surface = inject(statementEditorSurfaceKey, 'panel')

const i18nContent = $computed(() => props.parsed?.content ?? '')
const fieldMeta = useParamFieldMeta({
  i18nContent: () => i18nContent,
  mode: () => props.mode,
  surface: () => surface,
  t,
})

const visibleFields = $computed(() => {
  return fieldMeta.filterVisibleFields(props.fields, props.isFieldVisible)
})

const visibleFieldIndexMap = $computed(() => {
  const map = new Map<string, number>()
  for (const [index, field] of visibleFields.entries()) {
    map.set(field.key, index)
  }
  return map
})

const isInline = $computed(() => surface === 'inline')
const notSelectedLabel = $computed(() => t('edit.visualEditor.options.notSelected'))

const customField = useParamCustomField({
  visibleFields: () => visibleFields,
  getFieldSelectValue: field => props.getFieldSelectValue(field),
  isFieldCustom: field => props.isFieldCustom(field),
})

function label(field: EditorField): string {
  return resolveI18n(field.field.label, t, i18nContent)
}

function controlClass(field: EditorField): string {
  return field.field.className ?? ''
}

const xyPad = isInline
  ? undefined
  : useParamXyPad({
      visibleFields: () => visibleFields,
      visibleFieldIndexMap: () => visibleFieldIndexMap,
      getFieldValue: field => props.getFieldValue(field),
      labelFn: label,
      controlClassFn: controlClass,
    })

function handlePanelXyUpdate(field: EditorField, value: { x: string, y: string }) {
  const xField = xyPad?.readPanelXyField(field, 'x')
  const yField = xyPad?.readPanelXyField(field, 'y')
  if (!xField || !yField) {
    return
  }
  emit('updateValue', { field: xField, value: value.x })
  emit('updateValue', { field: yField, value: value.y })
}

function fieldMode(field: EditorField) {
  return fieldMeta.fieldMode(field)
}

function choiceFieldMode(field: EditorField): 'select' | 'combobox' | undefined {
  const mode = fieldMode(field)
  if (mode === 'select' || mode === 'combobox') {
    return mode
  }
  return undefined
}

function isNumberMode(field: EditorField): boolean {
  return fieldMeta.isNumberMode(field)
}

function isTextareaMode(field: EditorField): boolean {
  return fieldMeta.isTextareaMode(field)
}

function isInlineStandalone(field: EditorField): boolean {
  return isInline && field.field.inlineLayout === 'standalone'
}

function fieldLayout(field: EditorField): 'row' | 'column' {
  return fieldMeta.fieldLayout(field, isInline)
}

function placeholder(field: EditorField): string {
  return fieldMeta.placeholder(field)
}

function customLabel(field: EditorField): string {
  return fieldMeta.customLabel(field)
}

function unitLabel(field: EditorField): string {
  return fieldMeta.unitLabel(field)
}

function fileTitle(field: EditorField): string {
  return fieldMeta.fileTitle(field)
}

function switchModelValue(field: EditorField): boolean {
  return fieldMeta.switchModelValue(field, props.getFieldValue(field))
}

function resolveNumberControlVariant(field: EditorField): 'input' | 'input-with-unit' | 'slider-input' {
  return fieldMeta.resolveNumberControlVariant(field)
}

function shouldUseInputAutoWidth(field: EditorField): boolean {
  return fieldMeta.shouldUseInputAutoWidth(field)
}

function isFileField(field: EditorField): boolean {
  return fieldMeta.isFileField(field)
}

function isFileFieldInvalid(field: EditorField): boolean {
  return isFileField(field) && props.isFieldFileMissing(field)
}

function getStaticOptions(field: EditorField): ParamSelectOptionItem[] {
  if (field.field.type !== 'choice') {
    return []
  }
  const options = field.field.options as { value: string, label: I18nLike }[]
  return options.map(option => ({
    value: option.value,
    label: resolveI18n(option.label, t, i18nContent),
  }))
}

function getMergedOptions(field: EditorField): ParamSelectOptionItem[] {
  const merged: ParamSelectOptionItem[] = []
  const seen = new Set<string>()
  for (const option of [...(props.getDynamicOptions(field) ?? []), ...getStaticOptions(field)]) {
    if (seen.has(option.value)) {
      continue
    }
    seen.add(option.value)
    merged.push(option)
  }
  return merged
}

function shouldRenderSegmented(field: EditorField): boolean {
  return field.field.type === 'choice'
    && resolveSurfaceVariant(field.field.variant, surface, 'select') === 'segmented'
}

function handleSelectUpdate(field: EditorField, value: unknown) {
  const normalizedValue = normalizeFieldStringValue(value)
  if (customField.onSelectChange(field, normalizedValue)) {
    // 进入 custom 模式时清空当前值，避免沿用上一个预设选项值。
    emit('updateValue', { field, value: '' })
  }
  emit('updateSelect', { field, value: normalizedValue })
}

function handleLabelPointerDown(event: PointerEvent, field: EditorField) {
  if (!props.canScrub(field)) {
    return
  }
  emit('labelPointerDown', { field, event })
}

function getNumericField(field: EditorField): NumberField | undefined {
  if (field.field.type === 'number') {
    return field.field
  }
  return undefined
}

function getFileConfig(field: EditorField): FileFieldConfig | undefined {
  if (field.field.type === 'file') {
    return field.field.fileConfig
  }
  return undefined
}

function fileRootPath(field: EditorField): string {
  const config = getFileConfig(field)
  if (!config) {
    return ''
  }
  return props.fileRootPaths[config.assetType] ?? ''
}

function fileExtensions(field: EditorField): string[] {
  return getFileConfig(field)?.extensions ?? []
}

function fileExclude(field: EditorField): string[] | undefined {
  return getFileConfig(field)?.exclude
}

const { buildControlId } = useControlId('param')

function customFieldInputId(field: EditorField): string {
  return buildControlId(`custom-${field.key}`)
}

function fieldInputId(field: EditorField): string {
  return buildControlId(`field-${field.key}`)
}
</script>

<template>
  <template
    v-for="field in visibleFields"
    :key="field.key"
  >
    <template v-if="!xyPad?.shouldSkipField(field)">
      <div
        :class="cn(
          'group w-full flex gap-1',
          fieldLayout(field) === 'row' ? 'w-auto flex-row gap-1.5 items-center' : 'flex-col',
          shouldUseInputAutoWidth(field) && 'w-full max-w-full min-w-0',
          isFileField(field) && 'max-w-full min-w-0',
          isInlineStandalone(field) && 'w-full',
        )"
        :data-surface="surface"
        :data-layout="fieldLayout(field)"
      >
        <Label
          v-if="!isInlineStandalone(field)"
          :for="fieldInputId(field)"
          :class="cn('text-xs text-muted-foreground w-fit group-data-[surface=panel]:font-medium', fieldLayout(field) === 'row' && 'shrink-0', canScrub(field) && 'cursor-ew-resize select-none touch-none')"
          @pointerdown="handleLabelPointerDown($event, field)"
        >
          {{ xyPad?.displayLabel(field) ?? label(field) }}
        </Label>

        <Switch
          v-if="fieldMode(field) === 'switch'"
          :id="fieldInputId(field)"
          :class="cn('scale-75 group-data-[surface=panel]:scale-100', controlClass(field))"
          :model-value="switchModelValue(field)"
          @update:model-value="emit('updateValue', { field, value: !!$event })"
        />

        <FocusXYControl
          v-else-if="xyPad?.shouldRenderPanelXyPad(field)"
          :id="fieldInputId(field)"
          :class="xyPad?.panelXyControlClass(field)"
          :min="xyPad?.panelXyMin(field)"
          :max="xyPad?.panelXyMax(field)"
          :step="xyPad?.panelXyStep(field)"
          x-label="X"
          y-label="Y"
          :x-value="xyPad?.panelXyValue(field, 'x')"
          :y-value="xyPad?.panelXyValue(field, 'y')"
          @update-value="handlePanelXyUpdate(field, $event)"
        />

        <NumberControl
          v-else-if="isNumberMode(field)"
          :id="fieldInputId(field)"
          :auto-width-by-content="shouldUseInputAutoWidth(field)"
          :class="controlClass(field)"
          :variant="resolveNumberControlVariant(field)"
          :min="getNumericField(field)?.min"
          :max="getNumericField(field)?.max"
          :value="getFieldValue(field)"
          :unit-label="unitLabel(field)"
          @update-value="emit('updateValue', { field, value: $event })"
          @commit-slider="emit('commitSlider', { field, event: $event })"
        />

        <ParamChoiceField
          v-else-if="choiceFieldMode(field)"
          :field="field"
          :mode="choiceFieldMode(field) ?? 'select'"
          :input-id="fieldInputId(field)"
          :custom-input-id="customFieldInputId(field)"
          :surface="surface"
          :control-class="controlClass(field)"
          :options="getMergedOptions(field)"
          :select-value="customField.selectModelValue(field)"
          :value="getFieldValue(field)"
          :custom-label="customLabel(field)"
          :custom-option-label="customOptionLabel"
          :not-selected-label="notSelectedLabel"
          :placeholder="placeholder(field)"
          :is-custom-field="customField.isCustomField(field)"
          :render-segmented="shouldRenderSegmented(field)"
          @update-select="handleSelectUpdate(field, $event)"
          @update-value="emit('updateValue', { field, value: $event })"
        />

        <ColorPicker
          v-else-if="fieldMode(field) === 'color'"
          :trigger-id="fieldInputId(field)"
          :class="controlClass(field)"
          :model-value="String(getFieldValue(field) || '')"
          @update:model-value="emit('updateValue', { field, value: normalizeFieldStringValue($event) })"
        />

        <Textarea
          v-else-if="isTextareaMode(field)"
          :id="fieldInputId(field)"
          :model-value="String(getFieldValue(field) || '')"
          :class="cn(
            'text-xs py-1 shadow-none resize-none overflow-y-auto px-2.5 w-32 group-data-[surface=panel]:flex-1 group-data-[surface=panel]:px-3 group-data-[surface=panel]:w-full',
            fieldMode(field) === 'textareaGrow' ? 'min-h-14.5 max-h-[50vh] field-sizing-content' : 'min-h-6 max-h-14.5 field-sizing-content group-data-[surface=panel]:min-h-7',
            isInlineStandalone(field) && 'w-full min-w-0',
            controlClass(field)
          )"
          @update:model-value="emit('updateValue', { field, value: normalizeFieldStringValue($event) })"
        />

        <FilePicker
          v-else-if="fieldMode(field) === 'file'"
          :input-id="fieldInputId(field)"
          :model-value="String(getFieldValue(field) || '')"
          :invalid="isFileFieldInvalid(field)"
          :root-path="fileRootPath(field)"
          :extensions="fileExtensions(field)"
          :exclude="fileExclude(field)"
          :popover-title="fileTitle(field) || undefined"
          :placeholder="fileTitle(field) || undefined"
          :class="cn(
            'w-auto max-w-full min-w-0 group-data-[surface=panel]:w-full [&_input]:text-xs [&_input]:h-6 [&_input]:pl-2.5 [&_input]:field-sizing-content [&_input]:w-auto [&_input]:max-w-full [&_input]:min-w-24 [&_input]:shadow-none group-data-[surface=panel]:[&_input]:h-7 group-data-[surface=panel]:[&_input]:pl-3 group-data-[surface=panel]:[&_input]:w-full',
            controlClass(field),
          )"
          @update:model-value="emit('updateValue', { field, value: normalizeFieldStringValue($event) })"
        />

        <Input
          v-else
          :id="fieldInputId(field)"
          :model-value="String(getFieldValue(field) || '')"
          :class="cn(
            'text-xs h-6 px-2.5 w-24 shadow-none group-data-[surface=panel]:h-7 group-data-[surface=panel]:px-3 group-data-[surface=panel]:w-auto',
            shouldUseInputAutoWidth(field) && 'field-sizing-content w-auto max-w-full min-w-24',
            isInlineStandalone(field) && 'w-full min-w-0',
            controlClass(field),
          )"
          @update:model-value="emit('updateValue', { field, value: normalizeFieldStringValue($event) })"
        />
      </div>

      <div
        v-if="customField.isCustomField(field) && field.field.type !== 'choice'"
        :class="cn('group flex gap-1.5 w-auto max-w-full min-w-0 flex-row items-center data-[surface=panel]:w-full data-[surface=panel]:flex-col data-[surface=panel]:gap-1 data-[surface=panel]:items-stretch')"
        :data-surface="surface"
      >
        <Label
          v-if="customLabel(field)"
          :for="customFieldInputId(field)"
          :class="cn(
            'text-xs text-muted-foreground w-fit shrink-0',
            'group-data-[surface=panel]:font-medium',
          )"
        >
          {{ customLabel(field) }}
        </Label>
        <Input
          :id="customFieldInputId(field)"
          :model-value="String(getFieldValue(field) || '')"
          :class="cn(
            controlClass(field),
            'text-xs h-6 px-2.5 w-24 shadow-none',
            'field-sizing-content w-auto max-w-full min-w-24 group-data-[surface=panel]:w-full',
            'group-data-[surface=panel]:h-7 group-data-[surface=panel]:px-3',
          )"
          @update:model-value="emit('updateValue', { field, value: normalizeFieldStringValue($event) })"
        />
      </div>
    </template>
  </template>
</template>
