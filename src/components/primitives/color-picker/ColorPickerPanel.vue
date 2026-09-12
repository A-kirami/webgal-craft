<script setup lang="ts">
import {
  ColorAreaArea,
  ColorAreaRoot,
  ColorAreaThumb,
  ColorSliderRoot,
  ColorSliderThumb,
  ColorSliderTrack,
  ColorSwatchPickerItem,
  ColorSwatchPickerRoot,
  colorToString,
  convertToHsb,
  getChannelRange,
  getChannelValue,
  parseColor,
  setChannelValue,
} from 'reka-ui'

import { Button } from '~/components/ui/button'
import { useRecentColors } from '~/composables/useRecentColors'
import { cn } from '~/lib/utils'
import { usePreferenceStore } from '~/stores/preference'
import { clamp } from '~/utils/math'

import AlphaPercentScrubber from './AlphaPercentScrubber.vue'
import ColorSwatchBox from './ColorSwatchBox.vue'
import ColorValueField from './ColorValueField.vue'
import { formatHexText, formatHexValue, normalizeHexText } from './hex-text'
import { useColorCommit } from './useColorCommit'

import type { AcceptableValue, Color } from 'reka-ui'
import type { ColorPickerFormat } from '~/types/color-picker'

interface Props {
  disableAlpha?: boolean
}

const { disableAlpha = false } = defineProps<Props>()

const emit = defineEmits<{
  /** 拖拽中的实时值（每帧最多一次），供实时预览使用；权威写入见 update:modelValue */
  preview: [value: string]
}>()

const modelValue = defineModel<string>({ default: '' })

const { t } = useI18n()
const preferenceStore = usePreferenceStore()
const { recentColors } = useRecentColors()

const FALLBACK_COLOR = '#000000'

type ChannelName = 'red' | 'green' | 'blue' | 'hue' | 'saturation' | 'lightness'

function parseOrFallback(value: string): Color {
  try {
    const parsed = parseColor(value)
    return disableAlpha ? { ...parsed, alpha: 1 } : parsed
  } catch {
    return parseColor(FALLBACK_COLOR)
  }
}

const color = ref<Color>(parseOrFallback(modelValue.value))

const currentHex = $computed(() => formatHexValue(color.value))

// 拖拽中的中间颜色只落在本地状态上，指针释放后才写一次模型（见 useColorCommit）
const colorCommit = useColorCommit({
  commit: (value) => {
    modelValue.value = value
  },
  preview: value => emit('preview', value),
  readValue: () => formatHexValue(color.value),
})

// 外部 model 变化且与当前颜色不一致时才覆盖内部状态，避免拖动过程中的回环
watch(modelValue, (value) => {
  const next = parseOrFallback(value)
  const nextHex = formatHexValue(next)
  colorCommit.setBaseline(nextHex)
  if (nextHex !== currentHex) {
    color.value = next
  }
})

function handleColorUpdate(newColor: Color) {
  color.value = disableAlpha ? { ...newColor, alpha: 1 } : newColor
  colorCommit.handleChange()
}

// hex 字段只展示/编辑 RGB 部分（不带 `#`），提交时保留当前透明度
const hexText = $computed(() => formatHexText(color.value))

// 透明度百分比：字段提交与 % 拖拽共用同一写入路径（setChannelValue 内部裁剪到 0-100）
const alphaPercent = computed<number>({
  get: () => getChannelValue(color.value, 'alpha'),
  set: value => handleColorUpdate(setChannelValue(color.value, 'alpha', value)),
})

const alphaText = $computed(() => String(Math.round(alphaPercent.value)))

function channelText(channel: ChannelName): string {
  return String(Math.round(getChannelValue(color.value, channel)))
}

function commitHexText(text: string) {
  try {
    handleColorUpdate({ ...normalizeHexText(text), alpha: color.value.alpha })
  } catch {
    // 非法输入保持原值，字段回退到展示文本
  }
}

function commitChannelText(channel: ChannelName, text: string) {
  const value = Number.parseFloat(text)
  if (Number.isNaN(value)) {
    return
  }

  const range = getChannelRange(channel)
  handleColorUpdate(setChannelValue(color.value, channel, clamp(value, range.min, range.max)))
}

function commitAlphaText(text: string) {
  const value = Number.parseFloat(text)
  if (Number.isNaN(value)) {
    return
  }

  alphaPercent.value = value
}

// ─── 格式切换 ────────────────────────────────────

const FORMAT_ORDER: ColorPickerFormat[] = ['hex', 'rgb', 'hsl']
const FORMAT_LABELS: Record<ColorPickerFormat, string> = {
  hex: 'HEX',
  rgb: 'RGB',
  hsl: 'HSL',
}

const format = computed<ColorPickerFormat>({
  get: () => preferenceStore.colorPickerFormat,
  set: value => preferenceStore.colorPickerFormat = value,
})

// 按钮可见文本只有格式名，而 aria-label 会覆盖它：可访问名必须自带当前格式，否则读屏听不到状态
const formatSwitchA11yLabel = $computed(() =>
  t('common.colorPicker.switchFormatA11y', { format: FORMAT_LABELS[format.value] }))

// 单向循环；按住 Shift 反向（沿用 DevTools 在颜色格式上的 Shift+click 约定）
function cycleFormat(event: MouseEvent) {
  const step = event.shiftKey ? -1 : 1
  const index = FORMAT_ORDER.indexOf(format.value)
  format.value = FORMAT_ORDER[(index + step + FORMAT_ORDER.length) % FORMAT_ORDER.length]
}

interface ChannelField {
  channel: ChannelName
  label: string
  min: number
  max: number
}

// 范围由 reka 统一提供（RGB 0-255、H 0-360、S/L 0-100），同时作为原生 min/max 与 Home/End 的落点
function createChannelField(channel: ChannelName, label: string): ChannelField {
  const { min, max } = getChannelRange(channel)
  return { channel, label, min, max }
}

const channelFields = $computed<ChannelField[]>(() => {
  if (format.value === 'rgb') {
    return [
      createChannelField('red', 'R'),
      createChannelField('green', 'G'),
      createChannelField('blue', 'B'),
    ]
  }
  if (format.value === 'hsl') {
    return [
      createChannelField('hue', 'H'),
      createChannelField('saturation', 'S'),
      createChannelField('lightness', 'L'),
    ]
  }
  return []
})

// ─── 最近使用 ────────────────────────────────────

function handleRecentSelect(value: AcceptableValue) {
  if (typeof value !== 'string' || !value) {
    return
  }
  handleColorUpdate(parseOrFallback(value))
}

// 白边内外各叠一圈深色细描边（box-shadow 跟随圆角），在亮色/白色区域也能看清轮廓
const thumbClass = 'block size-4 shrink-0 cursor-pointer rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.3),inset_0_0_0_1px_rgb(0_0_0/0.3),0_1px_2px_rgb(0_0_0/0.15)]'

// 色板 thumb 填充当前颜色（不含透明度，避免透出下方渐变）
const opaqueThumbColor = $computed(() => colorToString({ ...color.value, alpha: 1 }, 'hex'))

// 色相 thumb 对应该轨道位置的语义：当前色相的纯色（满饱和度/明度）
const hueThumbColor = $computed(() => {
  const { h } = convertToHsb(color.value)
  return colorToString({ space: 'hsb', h, s: 100, b: 100, alpha: 1 }, 'hex')
})

// 透明度 thumb 保持透明：透出轨道渐变，拖动时随位置变化（小尺寸下棋盘格衬底会糊成一片）
const alphaThumbClass = cn(thumbClass, 'bg-transparent')
const fieldInputClass = 'h-full px-1.5 text-[11px] text-center tabular-nums'
</script>

<template>
  <div
    class="flex flex-col gap-3 w-56"
    @pointerdown.capture="colorCommit.beginInteraction"
  >
    <!-- 2D 色板（HSB：饱和度 × 明度） -->
    <ColorAreaRoot
      v-slot="{ style }"
      :model-value="color"
      color-space="hsb"
      x-channel="saturation"
      y-channel="brightness"
      @update:color="handleColorUpdate"
    >
      <ColorAreaArea
        class="rounded-md h-36 w-full block relative"
        :style="style"
        data-testid="color-picker-area"
      >
        <ColorAreaThumb
          :class="thumbClass"
          :style="{ backgroundColor: opaqueThumbColor }"
          data-testid="color-picker-area-thumb"
        />
      </ColorAreaArea>
    </ColorAreaRoot>

    <!-- 预览色块 + 水平滑条 -->
    <div class="flex gap-2 items-center">
      <ColorSwatchBox
        :color="currentHex"
        class="border border-border/50 rounded-md shrink-0 size-8"
      />
      <div class="flex flex-1 flex-col gap-2.5 min-w-0 justify-center">
        <ColorSliderRoot
          :model-value="color"
          channel="hue"
          color-space="hsb"
          class="flex h-3 w-full select-none items-center relative touch-none"
          @update:color="handleColorUpdate"
        >
          <ColorSliderTrack class="rounded-full grow h-full relative overflow-hidden" />
          <ColorSliderThumb
            :class="thumbClass"
            :style="{ backgroundColor: hueThumbColor }"
            data-testid="color-picker-hue-thumb"
          />
        </ColorSliderRoot>
        <ColorSliderRoot
          v-if="!disableAlpha"
          :model-value="color"
          channel="alpha"
          color-space="hsb"
          class="flex h-3 w-full select-none items-center relative touch-none"
          @update:color="handleColorUpdate"
        >
          <ColorSliderTrack class="rounded-full grow h-full relative overflow-hidden" />
          <ColorSliderThumb
            :class="alphaThumbClass"
            data-testid="color-picker-alpha-thumb"
          />
        </ColorSliderRoot>
      </div>
    </div>

    <!-- 字段行：格式循环钮 + 值区 + 透明度 -->
    <div class="flex gap-1.5 items-center">
      <TooltipProvider :delay-duration="300">
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="xs"
              class="text-muted-foreground font-medium shrink-0 gap-0 w-12"
              :aria-label="formatSwitchA11yLabel"
              data-testid="color-picker-format-switch"
              @click="cycleFormat"
            >
              {{ FORMAT_LABELS[format] }}
              <div class="i-lucide-chevrons-up-down opacity-50 shrink-0 size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" class="px-2 py-1" data-testid="color-picker-format-tooltip">
            {{ t('common.colorPicker.switchFormat') }}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <InputGroup class="flex-1 gap-0.5 h-6 min-w-0">
        <ColorValueField
          v-if="format === 'hex'"
          :text="hexText"
          :class="cn(fieldInputClass, 'text-left')"
          aria-label="HEX"
          data-testid="color-picker-panel-hex-field"
          @commit="commitHexText"
        />

        <template v-for="(field, index) in channelFields" v-else :key="field.channel">
          <Separator v-if="index > 0" orientation="vertical" />
          <ColorValueField
            :text="channelText(field.channel)"
            type="number"
            :min="field.min"
            :max="field.max"
            :class="fieldInputClass"
            :aria-label="field.label"
            @commit="commitChannelText(field.channel, $event)"
          />
        </template>

        <template v-if="!disableAlpha">
          <Separator
            orientation="vertical"
            data-testid="color-picker-panel-field-divider"
          />
          <ColorValueField
            :text="alphaText"
            type="number"
            :min="0"
            :max="100"
            :class="cn(fieldInputClass, 'flex-none w-8 px-1')"
            :aria-label="t('common.colorPicker.alpha')"
            data-testid="color-picker-alpha-field"
            @commit="commitAlphaText"
          />
          <AlphaPercentScrubber
            ::percent="alphaPercent"
            class="pr-1"
            data-testid="color-picker-alpha-scrubber"
          />
        </template>
      </InputGroup>
    </div>

    <!-- 最近使用 -->
    <div
      v-if="recentColors.length > 0"
      role="group"
      :aria-label="t('common.colorPicker.recentColors')"
      class="pt-2.5 border-t border-border/50"
      data-testid="color-picker-recent"
    >
      <ColorSwatchPickerRoot
        class="gap-1.5 grid grid-cols-9"
        @update:model-value="handleRecentSelect"
      >
        <ColorSwatchPickerItem
          v-for="hex in recentColors"
          :key="hex"
          :value="hex"
          class="rounded-sm cursor-pointer"
        >
          <ColorSwatchBox :color="hex" class="border border-border/50 rounded-sm size-4.5" />
        </ColorSwatchPickerItem>
      </ColorSwatchPickerRoot>
    </div>
  </div>
</template>
