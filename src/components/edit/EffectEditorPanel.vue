<script setup lang="ts">
interface EffectEditorPanelProps {
  transform: Transform
  duration: string
  ease: string
  canApply: boolean
  canReset: boolean
  showFooter?: boolean
  inline?: boolean
}

const props = withDefaults(defineProps<EffectEditorPanelProps>(), {
  showFooter: true,
})

const emit = defineEmits<{
  'update:transform': [payload: EffectEditorTransformUpdatePayload]
  'update:duration': [value: string]
  'update:ease': [value: string]
  'preview': [payload: EffectEditorPreviewPayload]
  'apply': []
  'reset': []
}>()

const easeModelValue = $computed(() => props.ease || DEFAULT_EASE_OPTION_VALUE)
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

function tryEmitApply() {
  if (!props.canApply) {
    return
  }
  emit('apply')
}

function tryEmitReset() {
  if (!props.canReset) {
    return
  }
  emit('reset')
}

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

// 构建控件共享依赖
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

const { buildControlId } = useControlId('effect-editor')

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
  <div
    class="flex flex-col h-full min-h-0 [&_button]:shadow-none [&_input]:shadow-none"
    @keydown.ctrl.enter.prevent="tryEmitApply"
    @keydown.meta.enter.prevent="tryEmitApply"
  >
    <div class="mb-3 px-1 flex flex-wrap gap-3 items-center">
      <div class="flex flex-auto gap-2 items-center">
        <span
          class="text-xs text-muted-foreground shrink-0 cursor-ew-resize select-none touch-none"
          @pointerdown="handleDurationLabelPointerDown"
        >
          {{ $t('edit.visualEditor.params.duration') }}
        </span>
        <InputGroup class="grow h-7 w-28 shadow-none">
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
      <div class="flex flex-auto gap-2 items-center">
        <span class="text-xs text-muted-foreground shrink-0">
          {{ $t('edit.visualEditor.params.ease') }}
        </span>
        <Select :model-value="easeModelValue" @update:model-value="updateEase">
          <SelectTrigger :id="easeTriggerId" class="text-xs grow h-7 w-28">
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
      <div class="flex flex-col gap-3">
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
                class="gap-2 grid grid-cols-2"
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
                    class="text-xs ml-auto h-7 w-24"
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
                <div class="flex flex-1 gap-2 max-w-76 items-center">
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
                <div class="mb-2 flex items-center justify-between">
                  <span class="text-xs text-muted-foreground">
                    {{ getLinkedSliderLabel(item.param) }}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    :class="['h-7 w-7', isLinkedSliderLocked(item.param) && 'bg-accent text-accent-foreground hover:bg-accent/80']"
                    @click="toggleLinkedSliderLock(item.param)"
                  >
                    <div :class="isLinkedSliderLocked(item.param) ? 'i-lucide-link' : 'i-lucide-unlink'" class="size-3.5" />
                  </Button>
                </div>

                <div class="flex flex-col gap-2 max-w-76">
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

    <div v-if="props.showFooter" class="mt-4 flex gap-2 justify-end">
      <Button variant="outline" class="text-xs px-3 h-7" :disabled="!props.canReset" @click="tryEmitReset">
        {{ $t('modals.effectEditor.reset') }}
      </Button>
      <Button class="text-xs px-3 h-7" :disabled="!props.canApply" @click="tryEmitApply">
        {{ $t('modals.effectEditor.apply') }}
      </Button>
    </div>
  </div>
</template>
