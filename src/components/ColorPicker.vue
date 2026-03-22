<script setup lang="ts">
import { ChromePicker } from 'vue-color'

import { cn } from '~/lib/utils'
import { ColorPickerHsl, ColorPickerHsla, ColorPickerValue } from '~/types/color-picker'

import type { HTMLAttributes } from 'vue'

import 'vue-color/style.css'

interface Props {
  class?: HTMLAttributes['class']
  disableAlpha?: boolean
  id?: string
}

const {
  class: rootClass,
  disableAlpha = false,
  id,
} = defineProps<Props>()

const color = defineModel<ColorPickerValue>({ default: '#000000' })

function isRgbLike(value: unknown): value is { a?: number, b: number | string, g: number | string, r: number | string } {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return (typeof record.r === 'number' || typeof record.r === 'string')
    && (typeof record.g === 'number' || typeof record.g === 'string')
    && (typeof record.b === 'number' || typeof record.b === 'string')
}

function isHslLike(value: unknown): value is ColorPickerHsl | ColorPickerHsla {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return typeof record.h === 'number'
    && typeof record.s === 'number'
    && typeof record.l === 'number'
}

function formatPercent(value: number): string {
  if (value <= 1 && value >= 0) {
    return `${value * 100}%`
  }
  return `${value}%`
}

function resolvePreviewColor(value: ColorPickerValue): string {
  if (typeof value === 'string') {
    return value
  }

  if (isRgbLike(value)) {
    if (typeof value.a === 'number') {
      return `rgba(${value.r}, ${value.g}, ${value.b}, ${value.a})`
    }
    return `rgb(${value.r}, ${value.g}, ${value.b})`
  }

  if (isHslLike(value)) {
    const s = formatPercent(value.s)
    const l = formatPercent(value.l)
    if ('a' in value && typeof value.a === 'number') {
      return `hsla(${value.h}, ${s}, ${l}, ${value.a})`
    }
    return `hsl(${value.h}, ${s}, ${l})`
  }

  return '#000000'
}
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <button
        :id="id"
        :class="cn('inline-flex items-center justify-center w-12 h-6 p-2px bg-transparent border border-border rounded-md transition-colors', rootClass)"
        type="button"
      >
        <span class="rounded-sm h-full w-full block" :style="{ backgroundColor: resolvePreviewColor(color) }" />
      </button>
    </PopoverTrigger>
    <PopoverContent class="p-0 rounded-md w-auto shadow-md overflow-hidden" :side-offset="8">
      <ChromePicker ::="color" :disable-alpha="disableAlpha" class="[&_svg]:align-baseline [&_svg]:inline" />
    </PopoverContent>
  </Popover>
</template>
