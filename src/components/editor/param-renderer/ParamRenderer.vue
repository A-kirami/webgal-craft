<script setup lang="ts">
import { useControlId } from '~/composables/useControlId'
import { EditorField, FileFieldConfig, resolveI18n, resolveSurfaceVariant } from '~/features/editor/command-registry/schema'
import { getDiagnosticFieldStatus } from '~/features/editor/diagnostics/presentation'
import { selectHighestDiagnosticSeverity } from '~/features/editor/diagnostics/types'
import { normalizeFieldStringValue } from '~/features/editor/statement-editor/field-utils'
import { statementEditorSurfaceKey } from '~/features/editor/statement-editor/surface-context'
import { cn } from '~/lib/utils'
import { useEditSettingsStore } from '~/stores/edit-settings'

import FigurePositionControl from './controls/FigurePositionControl.vue'
import { useParamChoiceFieldViewModel } from './useParamChoiceFieldViewModel'
import { useParamFieldMeta } from './useParamFieldMeta'
import { useParamXyPad } from './useParamXyPad'

import type { StatementSchemaParamMode } from './useParamFieldMeta'
import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { ResolvedAutocompleteOption } from '~/features/editor/command-registry/autocomplete-options'
import type { NumberField } from '~/features/editor/command-registry/schema'
import type { EditorFieldDiagnostic } from '~/features/editor/diagnostics/types'

interface Props {
  canScrub: (field: EditorField) => boolean
  fields: EditorField[]
  fileRootPaths: Record<string, string>
  getAutocompleteOptions: (field: EditorField) => ResolvedAutocompleteOption[]
  getDynamicOptions: (field: EditorField) => { label: string, value: string }[]
  getFieldSelectOptions: (field: EditorField) => { label: string, value: string }[]
  supportsExtendedFigurePositions: boolean
  getFieldSelectValue: (field: EditorField) => string
  getFieldValue: (field: EditorField) => string | number | boolean
  getFieldDiagnostics: (field: EditorField) => readonly EditorFieldDiagnostic[]
  isFieldVisible: (field: EditorField) => boolean
  mode?: StatementSchemaParamMode
  parsed?: ISentence
}

const props = withDefaults(defineProps<Props>(), {
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
const editSettingsStore = useEditSettingsStore()

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

function label(field: EditorField): string {
  return resolveI18n(field.field.label, t, i18nContent)
}

function switchDescription(field: EditorField): string | undefined {
  if (field.field.type !== 'switch' || !field.field.tooltip) {
    return undefined
  }
  const description = switchModelValue(field) ? field.field.tooltip.on : field.field.tooltip.off
  return resolveI18n(description, t, i18nContent)
}

function controlClass(field: EditorField): string {
  return cn(
    field.field.className,
    shouldFillControlWidth(field) && 'w-full',
  )
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

function shouldFillControlWidth(field: EditorField): boolean {
  return isInlineStandalone(field)
    || (!isInline && fieldMode(field) !== 'switch')
}

function fieldLayout(field: EditorField): 'row' | 'column' {
  return fieldMeta.fieldLayout(field, isInline)
}

function resolvedPlaceholder(field: EditorField): string {
  const explicitPlaceholder = fieldMeta.placeholder(field)
  if (explicitPlaceholder !== undefined) {
    return explicitPlaceholder
  }
  if (isInlineStandalone(field)) {
    return label(field)
  }
  return ''
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

function fieldStatus(field: EditorField) {
  return getDiagnosticFieldStatus(selectHighestDiagnosticSeverity(props.getFieldDiagnostics(field)))
}

function fieldStatusClass(field: EditorField): string {
  switch (fieldStatus(field)) {
    case 'warning': {
      return 'text-yellow-700! bg-yellow/5 border-yellow/50 focus-visible:ring-yellow/30 dark:text-yellow-300!'
    }
    case 'error': {
      return 'text-destructive! bg-destructive/5 border-destructive/50 focus-visible:ring-destructive/30'
    }
    default: {
      return ''
    }
  }
}

function diagnosticTriggerClass(field: EditorField): string {
  return shouldFillControlWidth(field) ? 'w-full flex-col' : ''
}

function shouldRenderAutocomplete(field: EditorField): boolean {
  return field.field.type === 'text'
    && fieldMode(field) === 'autocomplete'
}

function shouldRenderSegmented(field: EditorField): boolean {
  if (field.field.type !== 'choice') {
    return false
  }

  const variant = resolveSurfaceVariant(field.field.variant, surface, 'select')
  return variant === 'segmented'
    || (variant === 'figure-position' && !props.supportsExtendedFigurePositions)
}

function shouldRenderFigurePosition(field: EditorField): boolean {
  return field.field.type === 'choice'
    && surface === 'panel'
    && props.supportsExtendedFigurePositions
    && resolveSurfaceVariant(field.field.variant, surface, 'select') === 'figure-position'
}

function handleSelectUpdate(field: EditorField, value: unknown) {
  const normalizedValue = normalizeFieldStringValue(value)
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

function fieldInputId(field: EditorField): string {
  return buildControlId(`field-${field.key}`)
}

const choiceFieldViewModels = $(useParamChoiceFieldViewModel({
  visibleFields: () => visibleFields,
  getChoiceFieldMode: choiceFieldMode,
  getComboboxPathDelimiter: () => {
    if (!editSettingsStore.enableComboboxPathDelimiter) {
      return ''
    }

    return editSettingsStore.comboboxPathDelimiter
  },
  getDynamicOptions: field => props.getDynamicOptions(field),
  getStaticOptions: field => props.getFieldSelectOptions(field),
  getPlaceholder: resolvedPlaceholder,
  getSelectValue: field => props.getFieldSelectValue(field),
  shouldRenderSegmented,
}).viewModels)
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
          shouldUseInputAutoWidth(field) && 'max-w-full min-w-0',
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

        <StatementDiagnosticTooltip
          :diagnostics="getFieldDiagnostics(field)"
          :description="switchDescription(field)"
          :class="diagnosticTriggerClass(field)"
        >
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

          <FigurePositionControl
            v-else-if="shouldRenderFigurePosition(field) && choiceFieldViewModels.get(field.key)"
            :input-id="fieldInputId(field)"
            :control-class="cn(controlClass(field), fieldStatusClass(field))"
            :options="choiceFieldViewModels.get(field.key)?.options ?? []"
            :select-value="choiceFieldViewModels.get(field.key)?.selectValue ?? ''"
            @update-select="handleSelectUpdate(field, $event)"
          />

          <ParamChoiceField
            v-else-if="choiceFieldViewModels.get(field.key)"
            :mode="choiceFieldViewModels.get(field.key)?.mode ?? 'select'"
            :input-id="fieldInputId(field)"
            :combobox-data="choiceFieldViewModels.get(field.key)?.comboboxData"
            :control-class="cn(controlClass(field), fieldStatusClass(field))"
            :options="choiceFieldViewModels.get(field.key)?.options ?? []"
            :select-value="choiceFieldViewModels.get(field.key)?.selectValue ?? ''"
            :not-selected-label="notSelectedLabel"
            :placeholder="choiceFieldViewModels.get(field.key)?.placeholder ?? ''"
            :render-segmented="choiceFieldViewModels.get(field.key)?.renderSegmented ?? false"
            @update-select="handleSelectUpdate(field, $event)"
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
            :placeholder="resolvedPlaceholder(field)"
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
            :status="fieldStatus(field)"
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

          <Autocomplete
            v-else-if="shouldRenderAutocomplete(field)"
            :id="fieldInputId(field)"
            :model-value="String(getFieldValue(field) || '')"
            :options="getAutocompleteOptions(field)"
            :placeholder="resolvedPlaceholder(field)"
            :container-class="cn(
              !isInline && 'w-full',
              shouldUseInputAutoWidth(field) && isInline && 'inline-flex max-w-full min-w-0',
              isInlineStandalone(field) && !shouldUseInputAutoWidth(field) && 'w-full min-w-0',
            )"
            :class="cn(
              'text-xs h-6 px-2.5 w-24 shadow-none',
              !isInline && 'h-7 px-3 w-full',
              shouldUseInputAutoWidth(field) && isInline && 'field-sizing-content w-auto max-w-full min-w-22',
              isInlineStandalone(field) && !shouldUseInputAutoWidth(field) && 'w-full min-w-0',
              fieldStatusClass(field),
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
        </StatementDiagnosticTooltip>
      </div>
    </template>
  </template>
</template>
