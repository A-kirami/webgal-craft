<script setup lang="ts">
import { usePointerDrag } from '~/composables/usePointerDrag'
import { normalizeFieldStringValue } from '~/features/editor/statement-editor/field-utils'
import { cn } from '~/lib/utils'
import { clamp, roundByStep } from '~/utils/math'

import type { HTMLAttributes } from 'vue'

interface Props {
  class?: HTMLAttributes['class']
  max?: number
  min?: number
  step?: number
  xLabel: string
  xValue: string | number | boolean
  yLabel: string
  yValue: string | number | boolean
}

const props = withDefaults(defineProps<Props>(), {
  class: undefined,
  max: 1,
  min: -1,
  step: 0.001,
})

const emit = defineEmits<{
  updateValue: [value: { x: string, y: string }]
}>()

const padRef = useTemplateRef<HTMLDivElement>('pad')
const PAD_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M12 1v7M12 16v7M1 12h7M16 12h7' stroke='black' stroke-width='2.5' stroke-linecap='round'/%3E%3Cpath d='M12 1v7M12 16v7M1 12h7M16 12h7' stroke='white' stroke-width='1.5' stroke-linecap='round'/%3E%3Ccircle cx='12' cy='12' r='2.5' fill='none' stroke='black' stroke-width='2.5'/%3E%3Ccircle cx='12' cy='12' r='2.5' fill='none' stroke='white' stroke-width='1.5'/%3E%3C/svg%3E") 12 12, crosshair`

const minValue = $computed(() => Math.min(props.min, props.max))
const maxValue = $computed(() => Math.max(props.min, props.max))
const rangeValue = $computed(() => {
  const range = maxValue - minValue
  return range > 0 ? range : 1
})
const stepValue = $computed(() => props.step > 0 ? props.step : 0.001)

function normalizeNumber(value: number): number {
  return roundByStep(clamp(value, minValue, maxValue), stepValue)
}

function parseNumber(value: unknown): number | undefined {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return
  }
  return numeric
}

function readAxisValue(value: unknown): number {
  const numeric = parseNumber(value)
  return normalizeNumber(numeric ?? 0)
}

let xInput = $ref('')
let yInput = $ref('')
let isDragging = $ref(false)
let pendingAxisValue: { x: string, y: string } | undefined
let scheduledEmitFrame: number | undefined

const xNumeric = $computed(() => readAxisValue(xInput))
const yNumeric = $computed(() => readAxisValue(yInput))

const handleStyle = $computed(() => {
  const leftPercent = ((xNumeric - minValue) / rangeValue) * 100
  const topPercent = ((maxValue - yNumeric) / rangeValue) * 100
  return {
    left: `${leftPercent}%`,
    top: `${topPercent}%`,
  }
})

function formatAxisInput(rawValue: unknown, fallbackValue: number): string {
  const text = normalizeFieldStringValue(rawValue).trim()
  if (!text) {
    return ''
  }
  const numeric = parseNumber(text)
  if (numeric === undefined) {
    return String(fallbackValue)
  }
  return String(normalizeNumber(numeric))
}

watch(
  () => [props.xValue, props.yValue] as const,
  ([xValue, yValue]) => {
    if (isDragging) {
      return
    }
    xInput = formatAxisInput(xValue, xNumeric)
    yInput = formatAxisInput(yValue, yNumeric)
  },
  { immediate: true },
)

function cancelScheduledEmit() {
  if (scheduledEmitFrame === undefined) {
    return
  }
  globalThis.cancelAnimationFrame(scheduledEmitFrame)
  scheduledEmitFrame = undefined
}

function flushScheduledEmit() {
  cancelScheduledEmit()
  if (!pendingAxisValue) {
    return
  }
  emit('updateValue', pendingAxisValue)
  pendingAxisValue = undefined
}

function scheduleAxisEmit(value: { x: string, y: string }) {
  pendingAxisValue = value
  if (scheduledEmitFrame !== undefined) {
    return
  }
  scheduledEmitFrame = globalThis.requestAnimationFrame(() => {
    scheduledEmitFrame = undefined
    if (!pendingAxisValue) {
      return
    }
    emit('updateValue', pendingAxisValue)
    pendingAxisValue = undefined
  })
}

function resolveAxisInput(rawInput: string, fallbackValue: number): string {
  const text = rawInput.trim()
  if (!text) {
    return ''
  }
  const numeric = parseNumber(text)
  if (numeric === undefined) {
    return String(fallbackValue)
  }
  return String(normalizeNumber(numeric))
}

function commitInputs() {
  const nextX = resolveAxisInput(xInput, xNumeric)
  const nextY = resolveAxisInput(yInput, yNumeric)
  xInput = nextX
  yInput = nextY
  pendingAxisValue = undefined
  cancelScheduledEmit()
  emit('updateValue', { x: nextX, y: nextY })
}

interface PadMetrics {
  contentHeight: number
  contentLeft: number
  contentTop: number
  contentWidth: number
}

function readPadMetrics(): PadMetrics | undefined {
  const pad = padRef.value
  if (!pad) {
    return
  }
  const rect = pad.getBoundingClientRect()
  const style = globalThis.getComputedStyle(pad)
  const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0
  const borderRight = Number.parseFloat(style.borderRightWidth) || 0
  const borderTop = Number.parseFloat(style.borderTopWidth) || 0
  const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0
  const contentWidth = rect.width - borderLeft - borderRight
  const contentHeight = rect.height - borderTop - borderBottom
  if (contentWidth <= 0 || contentHeight <= 0) {
    return
  }
  return {
    contentLeft: rect.left + borderLeft,
    contentTop: rect.top + borderTop,
    contentWidth,
    contentHeight,
  }
}

function updateByPointer(event: PointerEvent, metrics: PadMetrics) {
  const xRatio = clamp((event.clientX - metrics.contentLeft) / metrics.contentWidth, 0, 1)
  const yRatio = clamp((event.clientY - metrics.contentTop) / metrics.contentHeight, 0, 1)

  const nextX = String(normalizeNumber(minValue + (xRatio * rangeValue)))
  const nextY = String(normalizeNumber(maxValue - (yRatio * rangeValue)))

  xInput = nextX
  yInput = nextY
  scheduleAxisEmit({ x: nextX, y: nextY })
}

const drag = usePointerDrag<{ metrics: PadMetrics }>({
  onStart(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return
    }
    const metrics = readPadMetrics()
    if (!metrics) {
      return
    }
    isDragging = true
    updateByPointer(event, metrics)
    return { metrics }
  },
  onMove(event, state) {
    updateByPointer(event, state.metrics)
  },
  onEnd() {
    isDragging = false
    flushScheduledEmit()
  },
})

function handlePadPointerDown(event: PointerEvent) {
  event.preventDefault()
  drag.start(event)
}

function handleAxisInputUpdate(axis: 'x' | 'y', value: unknown) {
  const text = normalizeFieldStringValue(value)
  if (axis === 'x') {
    xInput = text
    return
  }
  yInput = text
}

function handleAxisInputKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Enter') {
    return
  }
  event.preventDefault()
  commitInputs()
}

onUnmounted(cancelScheduledEmit)
</script>

<template>
  <div :class="cn('w-full flex flex-col gap-2', props.class)">
    <div
      ref="pad"
      class="border border-input rounded-md bg-muted/25 max-w-44 w-full aspect-square cursor-crosshair select-none relative overflow-hidden touch-none"
      :style="{ cursor: PAD_CURSOR }"
      @pointerdown="handlePadPointerDown"
    >
      <div :class="$style.gridBg" class="inset-0 absolute" />
      <div class="bg-border/80 h-px left-0 right-0 top-1/2 absolute" />
      <div class="bg-border/80 w-px bottom-0 left-1/2 top-0 absolute" />
      <div
        class="border border-primary rounded-full bg-background size-3 pointer-events-none shadow-sm absolute -translate-x-1/2 -translate-y-1/2"
        :style="handleStyle"
      />
    </div>

    <div class="flex flex-wrap gap-2 w-full">
      <InputGroup class="flex-1 basis-20 h-7 min-w-0 w-full shadow-none">
        <InputGroupAddon class="text-xs text-muted-foreground min-w-5">
          {{ xLabel }}
        </InputGroupAddon>
        <InputGroupInput
          type="number"
          inputmode="decimal"
          :min="minValue"
          :max="maxValue"
          :step="stepValue"
          :model-value="xInput"
          class="text-xs pr-1 h-7 shadow-none"
          @update:model-value="handleAxisInputUpdate('x', $event)"
          @blur="commitInputs"
          @keydown="handleAxisInputKeydown"
        />
      </InputGroup>

      <InputGroup class="flex-1 basis-20 h-7 min-w-0 w-full shadow-none">
        <InputGroupAddon class="text-xs text-muted-foreground min-w-5">
          {{ yLabel }}
        </InputGroupAddon>
        <InputGroupInput
          type="number"
          inputmode="decimal"
          :min="minValue"
          :max="maxValue"
          :step="stepValue"
          :model-value="yInput"
          class="text-xs pr-1 h-7 shadow-none"
          @update:model-value="handleAxisInputUpdate('y', $event)"
          @blur="commitInputs"
          @keydown="handleAxisInputKeydown"
        />
      </InputGroup>
    </div>
  </div>
</template>

<style module>
.grid-bg {
  background-image:
    linear-gradient(to right, rgb(148 163 184 / 15%) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(148 163 184 / 15%) 1px, transparent 1px);
  background-size: 25% 25%;
}
</style>
