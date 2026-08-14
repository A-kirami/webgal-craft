<script setup lang="ts">
import { useControlId } from '~/composables/useControlId'
import { resolveI18n } from '~/features/editor/command-registry/schema'
import { resolveDynamicOptions } from '~/features/editor/dynamic-options/dynamic-options'
import {
  getAxisCompactLabel as getEffectDraftFormAxisCompactLabel,
  getClearPropertyLabel as getEffectDraftFormClearPropertyLabel,
  getLinkedSliderInputAriaLabel as getEffectDraftFormLinkedSliderInputAriaLabel,
  getLinkedSliderLabel as getEffectDraftFormLinkedSliderLabel,
} from '~/features/editor/effect-editor/effect-draft-form'
import {
  buildCategoryRenderItems,
  DEFAULT_EASE_OPTION_VALUE,
  EFFECT_CATEGORIES,
  EFFECT_EASE_OPTIONS,
  effectFieldValueToDisplay,
  transformFieldsToDisplay,
  transformToFields,
} from '~/features/editor/effect-editor/effect-editor-config'
import { flipTransformScaleAxis } from '~/features/editor/effect-editor/transform-flip'
import { useEffectClearControls } from '~/features/editor/effect-editor/useEffectClearControls'
import { useEffectColorControl } from '~/features/editor/effect-editor/useEffectColorControl'
import { useEffectContinuousControls } from '~/features/editor/effect-editor/useEffectContinuousControls'
import { useEffectDurationControl } from '~/features/editor/effect-editor/useEffectDurationControl'
import {
  createEffectPreviewEmitter,
} from '~/features/editor/effect-editor/useEffectEditorProvider'
import { useEffectSegmentedControl } from '~/features/editor/effect-editor/useEffectSegmentedControl'
import { resolveTransformDraftDisplay } from '~/features/editor/transform-resolution/model'
import { useWorkspaceStore } from '~/stores/workspace'

import type {
  EffectDraftCategoryControls,
  EffectDraftCategoryRenderModel,
  EffectDraftLinkedNumberField,
} from './effectDraftForm.types'
import type { Transform } from '~/domain/stage/types'
import type { ColorField, I18nLike } from '~/features/editor/command-registry/schema'
import type { TransformScaleAxis } from '~/features/editor/effect-editor/transform-flip'
import type { EffectControlDeps } from '~/features/editor/effect-editor/types'
import type {
  EffectEditorPreviewPayload,
  EffectEditorTransformUpdatePayload,
} from '~/features/editor/effect-editor/useEffectEditorProvider'
import type { TransformBaselineSource } from '~/features/editor/transform-resolution/model'

interface EffectDraftFormProps {
  transform: Transform
  baselineSource?: TransformBaselineSource
  baselineTransform?: Transform
  previewFieldValue?: (path: string) => string | undefined
  duration: string
  ease: string
  easeDisabled?: boolean
  idNamespace?: string
  inline?: boolean
  layout?: 'drawer' | 'panel'
}

const props = withDefaults(defineProps<EffectDraftFormProps>(), {
  idNamespace: 'effect-editor',
  layout: 'drawer',
})

const emit = defineEmits<{
  'update:transform': [payload: EffectEditorTransformUpdatePayload]
  'update:duration': [value: string]
  'update:ease': [value: string]
  'preview': [payload: EffectEditorPreviewPayload]
  'cancel-preview': []
}>()

const EFFECT_DRAFT_CATEGORY_RENDER_MODELS: EffectDraftCategoryRenderModel[] = EFFECT_CATEGORIES.map((category, index) => ({
  key: `${category.icon}-${index}`,
  label: category.label,
  items: buildCategoryRenderItems(category),
}))

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const resolveEffectDraftLabel = (value: I18nLike | undefined) => resolveI18n(value, t)
const easeModelValue = $computed(() => props.ease || DEFAULT_EASE_OPTION_VALUE)
const isPanelLayout = $computed(() => props.layout === 'panel')
const storedFields = $computed(() => transformToFields(props.transform))
const resolvedFields = $computed(() => transformToFields(resolveTransformDraftDisplay({
  baselineSource: props.baselineSource,
  baselineTransform: props.baselineTransform,
  explicitDraftTransform: props.transform,
}).displayTransform))
const displayFields = $computed(() => transformFieldsToDisplay(resolvedFields))

function getFields(): Record<string, string> {
  return { ...storedFields }
}

const { emitTransform } = createEffectPreviewEmitter({
  emitPreview: payload => emit('preview', payload),
  emitTransform: payload => emit('update:transform', payload),
})

const {
  updateDuration,
  handleDurationLabelPointerDown,
  updateEase,
  stopDurationScrub,
} = useEffectDurationControl({
  getDuration: () => props.duration,
  emitDuration: value => emit('update:duration', value),
  emitEase: value => emit('update:ease', value),
  defaultEaseValue: DEFAULT_EASE_OPTION_VALUE,
})

function getFieldValue(path: string): string {
  const previewValue = props.previewFieldValue?.(path)
  return previewValue === undefined
    ? displayFields[path] ?? ''
    : effectFieldValueToDisplay(path, previewValue)
}

function getStoredFieldValue(path: string): string | undefined {
  return storedFields[path]
}

function getNumberValue(path: string, fallback: number): number {
  const rawValue = props.previewFieldValue?.(path) ?? resolvedFields[path]
  if (!rawValue) {
    return fallback
  }
  const raw = Number(rawValue)
  return Number.isFinite(raw) ? raw : fallback
}

function setNumericField(fields: Record<string, string>, path: string, value: number) {
  if (!Number.isFinite(value)) {
    delete fields[path]
    return
  }
  fields[path] = String(value)
}

const controlDeps: EffectControlDeps = {
  getFields,
  getFieldValue,
  getStoredFieldValue,
  getNumberValue,
  setNumericField,
  emitTransform,
  cancelPreview: () => emit('cancel-preview'),
}

const {
  updateNumberField,
  canScrubNumber,
  handleNumberLabelPointerDown,
  numberScrub,
  getSliderTrackValue,
  getSliderMin,
  getSliderMax,
  getSliderStep,
  getFieldUnit: getFieldUnitValue,
  getSliderInputValue,
  updateSliderField,
  isLinkedSliderLocked,
  toggleLinkedSliderLock,
  getLinkedSliderInputValue,
  getLinkedSliderTrackValue,
  updateLinkedSliderField,
  getDialDegree,
  getDialIndicatorDegree,
  getDialInputValue,
  updateDialField,
  handleDialPointerDown,
  dialDrag,
  resetLinkedSliderState,
} = useEffectContinuousControls(controlDeps)

const {
  getColorPickerValue,
  handleColorPickerOpenChange,
  handleColorPickerChange,
  cancelColorInteraction,
} = useEffectColorControl(controlDeps)

const { buildControlId } = useControlId(props.idNamespace)

const {
  getSegmentedOptions,
  getSegmentedValue,
  updateSegmentedField,
  segmentedControlId,
} = useEffectSegmentedControl({
  getFields,
  getFieldValue,
  emitTransform,
  resolveOptionLabel: label => resolveI18n(label as I18nLike, t),
  resolveDynamicOptionsFn: key => resolveDynamicOptions(key, {
    content: '',
    gamePath: workspaceStore.CWD ?? '',
  }),
  buildControlId,
})
const clearControls = useEffectClearControls(controlDeps)
const durationInputId = buildControlId('duration')
const easeTriggerId = buildControlId('ease')

function getFieldUnit(param: Parameters<typeof getFieldUnitValue>[0]): string | undefined {
  const unit = getFieldUnitValue(param)
  return unit ? resolveI18n(unit, t) : undefined
}

function getLinkedSliderLabel(param: EffectDraftLinkedNumberField): string {
  return getEffectDraftFormLinkedSliderLabel(param, resolveEffectDraftLabel)
}

function getAxisCompactLabel(path: string): 'X' | 'Y' {
  return getEffectDraftFormAxisCompactLabel(path)
}

function getLinkedSliderInputAriaLabel(
  param: EffectDraftLinkedNumberField,
  index: 0 | 1,
): string {
  return getEffectDraftFormLinkedSliderInputAriaLabel(param, index, resolveEffectDraftLabel)
}

function numberInputId(path: string): string {
  return buildControlId(`number-${path}`)
}

function sliderInputId(path: string): string {
  return buildControlId(`slider-${path}`)
}

function dialInputId(path: string): string {
  return buildControlId(`dial-${path}`)
}

function colorControlId(param: ColorField): string {
  return buildControlId(`color-${(param.colorPaths ?? [param.key]).join('-')}`)
}

function flipScaleAxis(axis: TransformScaleAxis): void {
  const nextTransform = flipTransformScaleAxis({
    axis,
    baselineSource: props.baselineSource,
    baselineTransform: props.baselineTransform,
    transform: props.transform,
  })

  emitTransform(transformToFields(nextTransform), {
    deferAutoApply: false,
    flush: true,
  })
}

const categoryControls: EffectDraftCategoryControls = {
  numberInputId,
  sliderInputId,
  dialInputId,
  colorControlId,
  segmentedControlId,
  getFieldValue,
  getNumberValue,
  updateNumberField,
  canScrubNumber,
  handleNumberLabelPointerDown,
  getSliderTrackValue,
  getSliderMin,
  getSliderMax,
  getSliderStep,
  getFieldUnit,
  getSliderInputValue,
  updateSliderField,
  isLinkedSliderLocked,
  toggleLinkedSliderLock,
  getLinkedSliderLabel,
  getAxisCompactLabel,
  getLinkedSliderInputAriaLabel,
  getLinkedSliderInputValue,
  getLinkedSliderTrackValue,
  updateLinkedSliderField,
  getDialDegree,
  getDialIndicatorDegree,
  getDialInputValue,
  updateDialField,
  handleDialPointerDown,
  flipScaleAxis,
  getColorPickerValue,
  handleColorPickerOpenChange,
  handleColorPickerChange,
  getSegmentedValue,
  getSegmentedOptions,
  updateSegmentedField,
  ...clearControls,
  getClearPropertyLabel: label => getEffectDraftFormClearPropertyLabel(label, resolveEffectDraftLabel, t),
}

onUnmounted(() => {
  stopDurationScrub()
  numberScrub.cancel()
  dialDrag.cancel()
  cancelColorInteraction()
  resetLinkedSliderState()
})
</script>

<template>
  <div class="flex flex-col h-full min-h-0 [&_button]:shadow-none [&_input]:shadow-none">
    <div class="mb-3 px-1 flex flex-wrap gap-3 items-center" :class="isPanelLayout ? 'w-full max-w-[44rem]' : ''">
      <div class="flex flex-auto gap-2 items-center" :class="isPanelLayout ? 'grow-0 basis-auto' : ''">
        <Label
          :for="durationInputId"
          class="text-xs text-muted-foreground shrink-0 cursor-ew-resize select-none touch-none"
          @pointerdown="handleDurationLabelPointerDown"
        >
          {{ $t('edit.visualEditor.params.duration') }}
        </Label>
        <InputGroup :class="isPanelLayout ? 'w-42' : 'w-28'" class="grow h-7 shadow-none">
          <InputGroupInput
            :id="durationInputId"
            type="number"
            :model-value="props.duration"
            class="text-xs pr-1 h-7 shadow-none"
            @update:model-value="updateDuration"
          />
          <InputGroupAddon align="inline-end" class="text-xs">
            {{ $t('edit.visualEditor.params.unitMs') }}
          </InputGroupAddon>
        </InputGroup>
      </div>
      <div class="flex flex-auto gap-2 items-center" :class="isPanelLayout ? 'grow-0 basis-auto' : ''">
        <Label :for="easeTriggerId" class="text-xs text-muted-foreground shrink-0">
          {{ $t('edit.visualEditor.params.ease') }}
        </Label>
        <Select :model-value="easeModelValue" :disabled="props.easeDisabled" @update:model-value="updateEase">
          <SelectTrigger :id="easeTriggerId" :class="isPanelLayout ? 'w-42' : 'w-28'" class="text-xs grow h-7">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="opt in EFFECT_EASE_OPTIONS"
              :key="opt.value"
              :value="opt.value"
              class="text-xs"
            >
              {{ resolveI18n(opt.label, t) }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <ScrollArea class="pr-2 flex-1 min-h-0">
      <div class="flex flex-col gap-3" :class="isPanelLayout ? 'w-full max-w-[44rem]' : ''">
        <EffectDraftCategorySection
          v-for="category in EFFECT_DRAFT_CATEGORY_RENDER_MODELS"
          :key="category.key"
          :category="category"
          :controls="categoryControls"
          :is-panel-layout="isPanelLayout"
          :resolve-label="resolveEffectDraftLabel"
        />
      </div>
    </ScrollArea>
  </div>
</template>
