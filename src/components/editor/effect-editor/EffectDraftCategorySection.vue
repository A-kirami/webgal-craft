<script setup lang="ts">
import { UNSPECIFIED } from '~/features/editor/command-registry/schema'

import type {
  EffectDraftCategoryControls,
  EffectDraftCategoryRenderModel,
  EffectDraftLabelResolver,
  EffectDraftLinkedNumberField,
} from './effectDraftForm.types'

interface Props {
  category: EffectDraftCategoryRenderModel
  controls: EffectDraftCategoryControls
  isPanelLayout: boolean
  resolveLabel: EffectDraftLabelResolver
}

const props = defineProps<Props>()

type EffectDraftRenderItem = EffectDraftCategoryRenderModel['items'][number]
type EffectDraftClearableItem = Exclude<EffectDraftRenderItem, { kind: 'choice' | 'flip-actions' | 'position' }>

const CLEAR_IMMEDIATE_OPTIONS = {
  schedule: 'immediate',
  flush: true,
} as const
const LINKED_SLIDER_AXES = [0, 1] as const

function getClearPathsForItem(item: EffectDraftClearableItem): readonly string[] {
  switch (item.kind) {
    case 'number':
    case 'slider':
    case 'dial': {
      return [item.param.key]
    }
    case 'linked-slider': {
      return [item.param.key, item.param.linkedPairKey]
    }
    case 'color': {
      return item.param.colorPaths
    }
    default: {
      const neverItem: never = item
      return neverItem
    }
  }
}

function isClearButtonEnabled(paths: readonly string[]): boolean {
  return props.controls.canClearPaths(paths)
}

function getClearButtonClass(paths: readonly string[]): string {
  return [
    'size-5 transition duration-150 ease-out motion-reduce:transition-none',
    isClearButtonEnabled(paths)
      ? 'opacity-35 group-focus-within/field:opacity-100 group-hover/field:opacity-100'
      : 'opacity-0 pointer-events-none',
  ].join(' ')
}

function clearPaths(paths: readonly string[]): void {
  props.controls.clearPaths(paths, CLEAR_IMMEDIATE_OPTIONS)
}

function getClearPropertyLabel(label: Parameters<EffectDraftLabelResolver>[0]): string {
  return props.controls.getClearPropertyLabel(label)
}

function getLinkedSliderPath(param: EffectDraftLinkedNumberField, index: 0 | 1): string {
  return index === 0 ? param.key : param.linkedPairKey
}
</script>

<template>
  <fieldset
    data-testid="effect-draft-category-section"
    class="px-3 pb-3 pt-1 border border-border rounded-lg"
  >
    <legend class="text-xs text-muted-foreground px-1.5">
      {{ resolveLabel(category.label) }}
    </legend>

    <div class="flex flex-wrap gap-2.5">
      <template
        v-for="item in category.items"
        :key="item.key"
      >
        <div
          v-if="item.kind === 'position'"
          class="gap-2 grid"
          :class="isPanelLayout ? 'w-fit grid-cols-[repeat(2,minmax(0,14rem))]' : 'w-full grid-cols-2'"
        >
          <div
            v-for="param in item.params"
            :key="param.key"
            class="group/field px-2 py-1.5 border border-border/60 rounded-md flex gap-2 min-w-0 items-center"
          >
            <div class="flex shrink-0 gap-1 min-w-0 items-center">
              <Label
                :for="controls.numberInputId(param.key)"
                class="text-xs text-muted-foreground shrink min-w-0"
                :class="controls.canScrubNumber(param) ? 'cursor-ew-resize select-none touch-none' : ''"
                @pointerdown="controls.handleNumberLabelPointerDown($event, param)"
              >
                <span class="block truncate">{{ resolveLabel(param.label) }}</span>
              </Label>
              <div class="flex shrink-0 size-5 items-center justify-center">
                <Button
                  variant="ghost"
                  size="icon"
                  :class="getClearButtonClass([param.key])"
                  :aria-hidden="!isClearButtonEnabled([param.key]) ? 'true' : undefined"
                  :tabindex="!isClearButtonEnabled([param.key]) ? -1 : undefined"
                  :title="getClearPropertyLabel(param.label)"
                  :aria-label="getClearPropertyLabel(param.label)"
                  @click="clearPaths([param.key])"
                >
                  <div class="i-lucide-rotate-ccw size-3" />
                </Button>
              </div>
            </div>
            <InputGroup class="flex-1 h-7 min-w-0 shadow-none">
              <InputGroupInput
                :id="controls.numberInputId(param.key)"
                type="number"
                :model-value="controls.getFieldValue(param.key)"
                class="text-xs pr-1 flex-1 h-7 min-w-0 shadow-none"
                :placeholder="controls.getSliderInputValue(param)"
                @update:model-value="controls.updateNumberField(param, String($event ?? ''))"
                @blur="controls.updateNumberField(param, controls.getFieldValue(param.key), { flush: true })"
                @keydown.enter="controls.updateNumberField(param, controls.getFieldValue(param.key), { flush: true })"
              />
              <InputGroupAddon v-if="controls.getFieldUnit(param)" align="inline-end" class="text-xs">
                {{ controls.getFieldUnit(param) }}
              </InputGroupAddon>
            </InputGroup>
          </div>
        </div>

        <div v-else-if="item.kind === 'number'" class="group/field flex gap-2 w-full items-center">
          <div class="flex shrink-0 gap-1 min-w-0 w-24 items-center">
            <Label
              :for="controls.numberInputId(item.param.key)"
              class="text-xs text-muted-foreground shrink min-w-0"
              :class="controls.canScrubNumber(item.param) ? 'cursor-ew-resize select-none touch-none' : ''"
              @pointerdown="controls.handleNumberLabelPointerDown($event, item.param)"
            >
              <span class="block truncate">{{ resolveLabel(item.param.label) }}</span>
            </Label>
            <div class="flex shrink-0 size-5 items-center justify-center">
              <Button
                variant="ghost"
                size="icon"
                :class="getClearButtonClass(getClearPathsForItem(item))"
                :aria-hidden="!isClearButtonEnabled(getClearPathsForItem(item)) ? 'true' : undefined"
                :tabindex="!isClearButtonEnabled(getClearPathsForItem(item)) ? -1 : undefined"
                :title="getClearPropertyLabel(item.param.label)"
                :aria-label="getClearPropertyLabel(item.param.label)"
                @click="clearPaths(getClearPathsForItem(item))"
              >
                <div class="i-lucide-rotate-ccw size-3" />
              </Button>
            </div>
          </div>
          <InputGroup class="flex-1 h-7 shadow-none">
            <InputGroupInput
              :id="controls.numberInputId(item.param.key)"
              type="number"
              :model-value="controls.getFieldValue(item.param.key)"
              class="text-xs pr-1 h-7 shadow-none"
              :placeholder="controls.getSliderInputValue(item.param)"
              @update:model-value="controls.updateNumberField(item.param, String($event ?? ''))"
              @blur="controls.updateNumberField(item.param, controls.getFieldValue(item.param.key), { flush: true })"
              @keydown.enter="controls.updateNumberField(item.param, controls.getFieldValue(item.param.key), { flush: true })"
            />
            <InputGroupAddon v-if="controls.getFieldUnit(item.param)" align="inline-end" class="text-xs">
              {{ controls.getFieldUnit(item.param) }}
            </InputGroupAddon>
          </InputGroup>
        </div>

        <div v-else-if="item.kind === 'slider'" class="group/field flex gap-2 w-full items-center">
          <div class="flex shrink-0 gap-1 min-w-0 w-24 items-center">
            <Label :for="controls.sliderInputId(item.param.key)" class="text-xs text-muted-foreground shrink min-w-0">
              <span class="block truncate">{{ resolveLabel(item.param.label) }}</span>
            </Label>
            <div class="flex shrink-0 size-5 items-center justify-center">
              <Button
                variant="ghost"
                size="icon"
                :class="getClearButtonClass(getClearPathsForItem(item))"
                :aria-hidden="!isClearButtonEnabled(getClearPathsForItem(item)) ? 'true' : undefined"
                :tabindex="!isClearButtonEnabled(getClearPathsForItem(item)) ? -1 : undefined"
                :title="getClearPropertyLabel(item.param.label)"
                :aria-label="getClearPropertyLabel(item.param.label)"
                @click="clearPaths(getClearPathsForItem(item))"
              >
                <div class="i-lucide-rotate-ccw size-3" />
              </Button>
            </div>
          </div>
          <div class="flex flex-1 gap-2 items-center" :class="isPanelLayout ? 'max-w-[28rem]' : 'max-w-76'">
            <div class="flex-1">
              <Slider
                :min="controls.getSliderMin(item.param)"
                :max="controls.getSliderMax(item.param)"
                :step="controls.getSliderStep(item.param)"
                :model-value="controls.getSliderTrackValue(item.param)"
                @update:model-value="$event && controls.updateSliderField(item.param, $event[0] ?? 0, { fromSlider: true })"
                @value-commit="$event && controls.updateSliderField(item.param, $event[0] ?? 0, { fromSlider: true, flush: true })"
              />
            </div>
            <InputGroup class="h-7 shadow-none" :class="controls.getFieldUnit(item.param) ? 'w-18' : 'w-12.5'">
              <InputGroupInput
                :id="controls.sliderInputId(item.param.key)"
                type="number"
                :model-value="controls.getSliderInputValue(item.param)"
                class="text-xs pr-1 h-7 shadow-none"
                @update:model-value="controls.updateSliderField(item.param, String($event ?? ''))"
                @blur="controls.flushSliderField(item.param)"
                @keydown.enter="controls.flushSliderField(item.param)"
              />
              <InputGroupAddon v-if="controls.getFieldUnit(item.param)" align="inline-end" class="text-xs">
                {{ controls.getFieldUnit(item.param) }}
              </InputGroupAddon>
            </InputGroup>
          </div>
        </div>

        <div v-else-if="item.kind === 'linked-slider'" class="group/field px-2.5 py-2 border border-border/60 rounded-md w-full">
          <div class="mb-2 flex items-center justify-between" :class="isPanelLayout ? 'max-w-[28rem]' : ''">
            <div class="flex gap-1 min-w-0 items-center">
              <span class="text-xs text-muted-foreground truncate">
                {{ controls.getLinkedSliderLabel(item.param) }}
              </span>
              <div class="flex shrink-0 size-5 items-center justify-center">
                <Button
                  variant="ghost"
                  size="icon"
                  :class="getClearButtonClass(getClearPathsForItem(item))"
                  :aria-hidden="!isClearButtonEnabled(getClearPathsForItem(item)) ? 'true' : undefined"
                  :tabindex="!isClearButtonEnabled(getClearPathsForItem(item)) ? -1 : undefined"
                  :title="getClearPropertyLabel(item.param.linkedGroupLabel ?? item.param.label)"
                  :aria-label="getClearPropertyLabel(item.param.linkedGroupLabel ?? item.param.label)"
                  @click="clearPaths(getClearPathsForItem(item))"
                >
                  <div class="i-lucide-rotate-ccw size-3" />
                </Button>
              </div>
            </div>
            <TooltipProvider :delay-duration="0">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    size="icon"
                    variant="ghost"
                    :aria-label="controls.isLinkedSliderLocked(item.param) ? $t('modals.effectEditor.unlinkScale') : $t('modals.effectEditor.linkScale')"
                    :aria-pressed="controls.isLinkedSliderLocked(item.param)"
                    :class="['h-7 w-7', controls.isLinkedSliderLocked(item.param) && 'bg-accent text-accent-foreground hover:bg-accent/80']"
                    @click="controls.toggleLinkedSliderLock(item.param)"
                  >
                    <div :class="controls.isLinkedSliderLocked(item.param) ? 'i-lucide-link' : 'i-lucide-unlink'" class="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" class="px-2 py-1">
                  {{
                    controls.isLinkedSliderLocked(item.param)
                      ? $t('modals.effectEditor.unlinkScale')
                      : $t('modals.effectEditor.linkScale')
                  }}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div class="flex flex-col gap-2" :class="isPanelLayout ? 'max-w-[28rem]' : 'max-w-76'">
            <div v-for="axisIndex in LINKED_SLIDER_AXES" :key="axisIndex" class="flex gap-2 items-center">
              <span class="text-xs text-muted-foreground font-mono text-center shrink-0 w-4">
                {{ controls.getAxisCompactLabel(getLinkedSliderPath(item.param, axisIndex)) }}
              </span>
              <div class="flex-1">
                <Slider
                  :min="controls.getSliderMin(item.param)"
                  :max="controls.getSliderMax(item.param)"
                  :step="controls.getSliderStep(item.param)"
                  :model-value="controls.getLinkedSliderTrackValue(item.param, axisIndex)"
                  @update:model-value="$event && controls.updateLinkedSliderField(item.param, axisIndex, $event[0] ?? 0, { fromSlider: true })"
                  @value-commit="$event && controls.updateLinkedSliderField(item.param, axisIndex, $event[0] ?? 0, { fromSlider: true, flush: true })"
                />
              </div>
              <InputGroup class="h-7 shadow-none" :class="controls.getFieldUnit(item.param) ? 'w-18' : 'w-12.5'">
                <InputGroupInput
                  type="number"
                  :model-value="controls.getLinkedSliderInputValue(item.param, axisIndex)"
                  :aria-label="controls.getLinkedSliderInputAriaLabel(item.param, axisIndex)"
                  class="text-xs pr-1 h-7 shadow-none"
                  @update:model-value="controls.updateLinkedSliderField(item.param, axisIndex, String($event ?? ''))"
                  @blur="controls.flushLinkedSliderField(item.param, axisIndex)"
                  @keydown.enter="controls.flushLinkedSliderField(item.param, axisIndex)"
                />
                <InputGroupAddon v-if="controls.getFieldUnit(item.param)" align="inline-end" class="text-xs">
                  {{ controls.getFieldUnit(item.param) }}
                </InputGroupAddon>
              </InputGroup>
            </div>
          </div>
        </div>

        <div
          v-else-if="item.kind === 'dial'"
          class="group/field flex gap-2 items-center"
          :class="!item.param.compact && 'w-full'"
        >
          <div
            :class="item.param.compact ? 'px-2 py-1.5 border border-border/60 rounded-md inline-flex gap-2 items-center' : 'flex flex-1 gap-2 items-center'"
            role="group"
            :aria-label="resolveLabel(item.param.label)"
          >
            <div class="flex shrink-0 gap-1 min-w-0 items-center" :class="!item.param.compact && 'w-24'">
              <Label :for="controls.dialInputId(item.param.key)" class="text-xs text-muted-foreground shrink min-w-0">
                <span class="block truncate">{{ resolveLabel(item.param.label) }}</span>
              </Label>
              <div class="flex shrink-0 size-5 items-center justify-center">
                <Button
                  variant="ghost"
                  size="icon"
                  :class="getClearButtonClass(getClearPathsForItem(item))"
                  :aria-hidden="!isClearButtonEnabled(getClearPathsForItem(item)) ? 'true' : undefined"
                  :tabindex="!isClearButtonEnabled(getClearPathsForItem(item)) ? -1 : undefined"
                  :title="getClearPropertyLabel(item.param.label)"
                  :aria-label="getClearPropertyLabel(item.param.label)"
                  @click="clearPaths(getClearPathsForItem(item))"
                >
                  <div class="i-lucide-rotate-ccw size-3" />
                </Button>
              </div>
            </div>
            <div class="flex gap-2 items-center">
              <button
                type="button"
                :aria-label="resolveLabel(item.param.label)"
                class="border border-border rounded-full bg-muted/30 h-7 w-7 relative"
                @pointerdown="controls.handleDialPointerDown($event, item.param)"
              >
                <span
                  class="rounded bg-primary h-px w-3.5 origin-left left-1/2 top-1/2 absolute"
                  :style="{ transform: `translateY(-50%) rotate(${controls.getDialIndicatorDegree(controls.getDialDegree(item.param))}deg)` }"
                />
              </button>
              <InputGroup class="h-7 shadow-none" :class="controls.getFieldUnit(item.param) ? 'w-18' : 'w-15'">
                <InputGroupInput
                  :id="controls.dialInputId(item.param.key)"
                  type="number"
                  :model-value="controls.getDialInputValue(item.param)"
                  class="text-xs pr-1 h-7 shadow-none"
                  @update:model-value="controls.updateDialField(item.param, String($event ?? ''))"
                  @blur="controls.flushDialField(item.param)"
                  @keydown.enter="controls.flushDialField(item.param)"
                />
                <InputGroupAddon v-if="controls.getFieldUnit(item.param)" align="inline-end" class="text-xs">
                  {{ controls.getFieldUnit(item.param) }}
                </InputGroupAddon>
              </InputGroup>
            </div>
          </div>
        </div>

        <div
          v-else-if="item.kind === 'flip-actions'"
          class="px-2 py-1.5 border border-border/60 rounded-md inline-flex gap-1 items-center"
          role="group"
          :aria-label="$t('modals.effectEditor.flip')"
        >
          <span class="text-xs text-muted-foreground shrink-0">
            {{ $t('modals.effectEditor.flip') }}
          </span>
          <TooltipProvider :delay-duration="0">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  class="h-7 w-9"
                  :aria-label="$t('modals.effectEditor.flipHorizontal')"
                  @click="controls.flipScaleAxis('x')"
                >
                  <div class="i-lucide-flip-horizontal size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" class="px-2 py-1">
                {{ $t('modals.effectEditor.flipHorizontal') }}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  class="h-7 w-9"
                  :aria-label="$t('modals.effectEditor.flipVertical')"
                  @click="controls.flipScaleAxis('y')"
                >
                  <div class="i-lucide-flip-vertical size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" class="px-2 py-1">
                {{ $t('modals.effectEditor.flipVertical') }}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div v-else-if="item.kind === 'color'" class="group/field flex gap-2 w-full items-start">
          <div class="flex shrink-0 gap-1 min-w-0 w-24 items-start">
            <Label :for="controls.colorControlId(item.param)" class="text-xs text-muted-foreground pt-1 shrink min-w-0">
              <span class="block truncate">{{ resolveLabel(item.param.label) }}</span>
            </Label>
            <div class="pt-0.5 flex shrink-0 size-5 items-center justify-center">
              <Button
                variant="ghost"
                size="icon"
                :class="getClearButtonClass(getClearPathsForItem(item))"
                :aria-hidden="!isClearButtonEnabled(getClearPathsForItem(item)) ? 'true' : undefined"
                :tabindex="!isClearButtonEnabled(getClearPathsForItem(item)) ? -1 : undefined"
                :title="getClearPropertyLabel(item.param.label)"
                :aria-label="getClearPropertyLabel(item.param.label)"
                @click="clearPaths(getClearPathsForItem(item))"
              >
                <div class="i-lucide-rotate-ccw size-3" />
              </Button>
            </div>
          </div>
          <div class="flex flex-1 gap-2 items-center" @pointerdown="controls.handleColorPickerPointerDown($event, item.param)">
            <ColorPicker
              :id="controls.colorControlId(item.param)"
              :model-value="controls.getColorPickerValue(item.param)"
              disable-alpha
              class="h-7 w-24"
              @update:model-value="controls.handleColorPickerChange(item.param, $event)"
            />
          </div>
        </div>

        <div v-else-if="item.kind === 'choice'" class="group/field flex gap-2 w-full items-center">
          <div class="flex shrink-0 min-w-0 w-24 items-center">
            <Label :for="controls.segmentedControlId(item.param.key)" class="text-xs text-muted-foreground shrink min-w-0">
              <span class="block truncate">{{ resolveLabel(item.param.label) }}</span>
            </Label>
          </div>
          <div class="flex-1 min-w-0">
            <SegmentedControl
              :id="controls.segmentedControlId(item.param.key)"
              :model-value="controls.getSegmentedValue(item.param)"
              :options="controls.getSegmentedOptions(item.param)"
              group-class="p-0.5 border border-border/60 rounded-md bg-muted/20 inline-flex gap-0.5 w-full h-7"
              item-class="text-xs leading-none px-2 border-0 rounded-sm gap-1.5 h-5.5 flex-1 shadow-none data-[state=on]:text-accent-foreground data-[state=on]:bg-accent hover:bg-muted/60"
              @update-value="controls.updateSegmentedField(item.param, String($event ?? UNSPECIFIED))"
            />
          </div>
        </div>
      </template>
    </div>
  </fieldset>
</template>
