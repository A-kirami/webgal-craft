<script setup lang="ts">
import { useEffectColorControl } from '~/composables/effect-editor/useEffectColorControl'
import { useEffectContinuousControls } from '~/composables/effect-editor/useEffectContinuousControls'
import { useEffectDurationControl } from '~/composables/effect-editor/useEffectDurationControl'
import { useEffectSegmentedControl } from '~/composables/effect-editor/useEffectSegmentedControl'
import { useControlId } from '~/composables/useControlId'
import {
  createEffectPreviewEmitter,
} from '~/composables/useEffectEditorProvider'
import { resolveI18n, UNSPECIFIED } from '~/helper/command-registry/schema'
import { resolveDynamicOptions } from '~/helper/dynamic-options'
import {
  buildCategoryRenderItems,
  DEFAULT_EASE_OPTION_VALUE,
  EFFECT_CATEGORIES,
  EFFECT_EASE_OPTIONS,
  getValueByPath,
  transformToFields,
} from '~/helper/effect-editor-config'
import { clamp } from '~/helper/math'
import { useWorkspaceStore } from '~/stores/workspace'

import type { EffectControlDeps } from '~/composables/effect-editor/types'
import type {
  EffectEditorPreviewPayload,
  EffectEditorTransformUpdatePayload,
} from '~/composables/useEffectEditorProvider'
import type { ColorField, I18nLike, NumberField } from '~/helper/command-registry/schema'
import type { Transform } from '~/types/stage'

interface EffectDraftFormProps {
  transform: Transform
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
}>()

const easeModelValue = $computed(() => props.ease || DEFAULT_EASE_OPTION_VALUE)
const isPanelLayout = $computed(() => props.layout === 'panel')
const { t } = useI18n()
const workspaceStore = useWorkspaceStore()

const categoryRenderItems = $computed(() =>
  EFFECT_CATEGORIES.map(c => buildCategoryRenderItems(c.params)),
)

function getFields(): Record<string, string> {
  return transformToFields(props.transform)
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

function getAxisCompactLabel(key: string): string {
  return key.endsWith('.x') ? 'X' : 'Y'
}

function getLinkedSliderLabel(param: NumberField & { linkedPairKey: string }): string {
  if (param.linkedGroupLabel) {
    return resolveI18n(param.linkedGroupLabel, t)
  }
  return resolveI18n(param.label, t)
}

function getLinkedSliderInputAriaLabel(
  param: NumberField & { linkedPairKey: string },
  index: 0 | 1,
): string {
  const axisKey = index === 0 ? param.key : param.linkedPairKey
  return `${getLinkedSliderLabel(param)} ${getAxisCompactLabel(axisKey)}`
}

function getFieldValue(path: string): string {
  const source = props.transform as unknown as Record<string, unknown>
  const value = getValueByPath(source, path)
  return (value === undefined) ? '' : String(value)
}

function getNumberValue(path: string, fallback: number): number {
  const rawValue = getFieldValue(path)
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
  getNumberValue,
  setNumericField,
  emitTransform,
}

const {
  updateNumberField,
  canScrubNumber,
  handleNumberLabelPointerDown,
  numberScrub,
  getSliderTrackValue,
  getSliderInputValue,
  updateSliderField,
  flushSliderField,
  isLinkedSliderLocked,
  toggleLinkedSliderLock,
  getLinkedSliderInputValue,
  updateLinkedSliderField,
  flushLinkedSliderField,
  getDialDegree,
  getDialIndicatorDegree,
  getDialInputValue,
  updateDialField,
  flushDialField,
  handleDialPointerDown,
  dialDrag,
  resetLinkedSliderState,
} = useEffectContinuousControls(controlDeps)

const {
  getColorPickerValue,
  handleColorPickerPointerDown,
  handleColorPickerChange,
  clearPendingColorFlush,
  colorDrag,
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
const durationInputId = buildControlId('duration')
const easeTriggerId = buildControlId('ease')

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

onUnmounted(() => {
  stopDurationScrub()
  numberScrub.stop()
  dialDrag.stop()
  colorDrag.stop()
  clearPendingColorFlush()
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
        <fieldset
          v-for="(category, categoryIndex) in EFFECT_CATEGORIES"
          :key="`${category.icon}-${categoryIndex}`"
          class="px-3 pb-3 pt-1 border border-border rounded-lg"
        >
          <legend class="text-xs text-muted-foreground px-1.5">
            {{ resolveI18n(category.label, t) }}
          </legend>

          <div class="flex flex-col gap-2.5">
            <template
              v-for="item in categoryRenderItems[categoryIndex]"
              :key="item.key"
            >
              <div
                v-if="item.kind === 'position'"
                class="gap-2 grid"
                :class="isPanelLayout ? 'w-fit grid-cols-[repeat(2,minmax(0,14rem))]' : 'grid-cols-2'"
              >
                <div
                  v-for="param in item.params"
                  :key="param.key"
                  class="px-2 py-1.5 border border-border/60 rounded-md flex gap-2 items-center"
                >
                  <Label
                    :for="numberInputId(param.key)"
                    class="text-xs text-muted-foreground flex shrink-0 gap-1 items-center"
                    :class="canScrubNumber(param) ? 'cursor-ew-resize select-none touch-none' : ''"
                    @pointerdown="handleNumberLabelPointerDown($event, param)"
                  >
                    <span>{{ resolveI18n(param.label, t) }}</span>
                  </Label>
                  <Input
                    :id="numberInputId(param.key)"
                    type="number"
                    :model-value="getFieldValue(param.key)"
                    :class="isPanelLayout ? 'text-xs ml-auto h-7 w-24 flex-none' : 'text-xs ml-auto h-7 w-24'"
                    :placeholder="String(param.defaultValue)"
                    @update:model-value="updateNumberField(param, String($event ?? ''))"
                    @blur="updateNumberField(param, getFieldValue(param.key), { flush: true })"
                    @keydown.enter="updateNumberField(param, getFieldValue(param.key), { flush: true })"
                  />
                </div>
              </div>

              <div v-else-if="item.kind === 'number'" class="flex gap-2 items-center">
                <Label
                  :for="numberInputId(item.param.key)"
                  class="text-xs text-muted-foreground shrink-0 w-24"
                  :class="canScrubNumber(item.param) ? 'cursor-ew-resize select-none touch-none' : ''"
                  @pointerdown="handleNumberLabelPointerDown($event, item.param)"
                >
                  {{ resolveI18n(item.param.label, t) }}
                </Label>
                <Input
                  :id="numberInputId(item.param.key)"
                  type="number"
                  :model-value="getFieldValue(item.param.key)"
                  class="text-xs flex-1 h-7"
                  :placeholder="String(item.param.defaultValue)"
                  @update:model-value="updateNumberField(item.param, String($event ?? ''))"
                  @blur="updateNumberField(item.param, getFieldValue(item.param.key), { flush: true })"
                  @keydown.enter="updateNumberField(item.param, getFieldValue(item.param.key), { flush: true })"
                />
              </div>

              <div v-else-if="item.kind === 'slider'" class="flex gap-2 items-center">
                <Label :for="sliderInputId(item.param.key)" class="text-xs text-muted-foreground shrink-0 w-24">
                  {{ resolveI18n(item.param.label, t) }}
                </Label>
                <div class="flex flex-1 gap-2 items-center" :class="isPanelLayout ? 'max-w-[28rem]' : 'max-w-76'">
                  <Slider
                    :min="item.param.min"
                    :max="item.param.max"
                    :step="item.param.step"
                    :model-value="getSliderTrackValue(item.param)"
                    @update:model-value="$event && updateSliderField(item.param, $event[0] ?? 0, { fromSlider: true })"
                    @pointerup="flushSliderField(item.param)"
                  />
                  <Input
                    :id="sliderInputId(item.param.key)"
                    type="number"
                    :model-value="getSliderInputValue(item.param)"
                    class="text-xs h-7 w-12.5"
                    @update:model-value="updateSliderField(item.param, String($event ?? ''))"
                    @blur="flushSliderField(item.param)"
                    @keydown.enter="flushSliderField(item.param)"
                  />
                </div>
              </div>

              <div v-else-if="item.kind === 'linked-slider'" class="px-2.5 py-2 border border-border/60 rounded-md">
                <div class="mb-2 flex items-center justify-between" :class="isPanelLayout ? 'max-w-[28rem]' : ''">
                  <span class="text-xs text-muted-foreground">
                    {{ getLinkedSliderLabel(item.param) }}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    :aria-label="getLinkedSliderLabel(item.param)"
                    :aria-pressed="isLinkedSliderLocked(item.param)"
                    :class="['h-7 w-7', isLinkedSliderLocked(item.param) && 'bg-accent text-accent-foreground hover:bg-accent/80']"
                    @click="toggleLinkedSliderLock(item.param)"
                  >
                    <div :class="isLinkedSliderLocked(item.param) ? 'i-lucide-link' : 'i-lucide-unlink'" class="size-3.5" />
                  </Button>
                </div>

                <div class="flex flex-col gap-2" :class="isPanelLayout ? 'max-w-[28rem]' : 'max-w-76'">
                  <div class="flex gap-2 items-center">
                    <span class="text-xs text-muted-foreground font-mono text-center shrink-0 w-4">
                      {{ getAxisCompactLabel(item.param.key) }}
                    </span>
                    <Slider
                      :min="item.param.min"
                      :max="item.param.max"
                      :step="item.param.step"
                      :model-value="[clamp(getNumberValue(item.param.key, item.param.defaultValue ?? 0), item.param.min, item.param.max)]"
                      @update:model-value="$event && updateLinkedSliderField(item.param, 0, $event[0] ?? 0, { fromSlider: true })"
                      @pointerup="flushLinkedSliderField(item.param, 0)"
                    />
                    <Input
                      type="number"
                      :model-value="getLinkedSliderInputValue(item.param, 0)"
                      :aria-label="getLinkedSliderInputAriaLabel(item.param, 0)"
                      class="text-xs h-7 w-12.5"
                      @update:model-value="updateLinkedSliderField(item.param, 0, String($event ?? ''))"
                      @blur="flushLinkedSliderField(item.param, 0)"
                      @keydown.enter="flushLinkedSliderField(item.param, 0)"
                    />
                  </div>

                  <div class="flex gap-2 items-center">
                    <span class="text-xs text-muted-foreground font-mono text-center shrink-0 w-4">
                      {{ getAxisCompactLabel(item.param.linkedPairKey) }}
                    </span>
                    <Slider
                      :min="item.param.min"
                      :max="item.param.max"
                      :step="item.param.step"
                      :model-value="[clamp(getNumberValue(item.param.linkedPairKey, item.param.defaultValue ?? 0), item.param.min, item.param.max)]"
                      @update:model-value="$event && updateLinkedSliderField(item.param, 1, $event[0] ?? 0, { fromSlider: true })"
                      @pointerup="flushLinkedSliderField(item.param, 1)"
                    />
                    <Input
                      type="number"
                      :model-value="getLinkedSliderInputValue(item.param, 1)"
                      :aria-label="getLinkedSliderInputAriaLabel(item.param, 1)"
                      class="text-xs h-7 w-12.5"
                      @update:model-value="updateLinkedSliderField(item.param, 1, String($event ?? ''))"
                      @blur="flushLinkedSliderField(item.param, 1)"
                      @keydown.enter="flushLinkedSliderField(item.param, 1)"
                    />
                  </div>
                </div>
              </div>

              <div v-else-if="item.kind === 'dial'" class="flex gap-2 items-center">
                <Label v-if="!item.param.compact" :for="dialInputId(item.param.key)" class="text-xs text-muted-foreground shrink-0 w-24">
                  {{ resolveI18n(item.param.label, t) }}
                </Label>
                <div :class="item.param.compact ? 'px-2 py-1.5 border border-border/60 rounded-md inline-flex gap-2 items-center' : 'flex flex-1 gap-2 items-center'">
                  <Label v-if="item.param.compact" :for="dialInputId(item.param.key)" class="text-xs text-muted-foreground shrink-0">
                    {{ resolveI18n(item.param.label, t) }}
                  </Label>
                  <div class="flex gap-2 items-center">
                    <button
                      type="button"
                      :aria-label="resolveI18n(item.param.label, t)"
                      class="border border-border rounded-full bg-muted/30 h-7 w-7 relative"
                      @pointerdown="handleDialPointerDown($event, item.param)"
                    >
                      <span
                        class="rounded bg-primary h-px w-3.5 origin-left left-1/2 top-1/2 absolute"
                        :style="{ transform: `translateY(-50%) rotate(${getDialIndicatorDegree(getDialDegree(item.param))}deg)` }"
                      />
                    </button>
                    <Input
                      :id="dialInputId(item.param.key)"
                      type="number"
                      :model-value="getDialInputValue(item.param)"
                      class="text-xs h-7 w-15"
                      @update:model-value="updateDialField(item.param, String($event ?? ''))"
                      @blur="flushDialField(item.param)"
                      @keydown.enter="flushDialField(item.param)"
                    />
                  </div>
                </div>
              </div>

              <div v-else-if="item.kind === 'color'" class="flex gap-2 items-start">
                <Label :for="colorControlId(item.param)" class="text-xs text-muted-foreground pt-1 shrink-0 w-24">
                  {{ resolveI18n(item.param.label, t) }}
                </Label>
                <div class="flex flex-1 gap-2 items-center" @pointerdown="handleColorPickerPointerDown($event, item.param)">
                  <ColorPicker
                    :id="colorControlId(item.param)"
                    :model-value="getColorPickerValue(item.param)"
                    disable-alpha
                    class="h-7 w-24"
                    @update:model-value="handleColorPickerChange(item.param, $event)"
                  />
                </div>
              </div>

              <div v-else-if="item.kind === 'choice'" class="flex gap-2 items-center">
                <Label :for="segmentedControlId(item.param.key)" class="text-xs text-muted-foreground shrink-0 w-24">
                  {{ resolveI18n(item.param.label, t) }}
                </Label>
                <div class="flex-1 min-w-0">
                  <SegmentedControl
                    :id="segmentedControlId(item.param.key)"
                    :model-value="getSegmentedValue(item.param)"
                    :options="getSegmentedOptions(item.param)"
                    custom-option-label=""
                    group-class="p-0.5 border border-border/60 rounded-md bg-muted/20 inline-flex gap-0.5 w-full h-7"
                    item-class="text-xs leading-none px-2 border-0 rounded-sm gap-1.5 h-5.5 flex-1 shadow-none data-[state=on]:text-accent-foreground data-[state=on]:bg-accent hover:bg-muted/60"
                    @update-value="updateSegmentedField(item.param, String($event ?? UNSPECIFIED))"
                  />
                </div>
              </div>
            </template>
          </div>
        </fieldset>
      </div>
    </ScrollArea>
  </div>
</template>
