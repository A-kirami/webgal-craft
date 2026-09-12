<script setup lang="ts">
import { parseColor } from 'reka-ui'

import { useRecentColors } from '~/composables/useRecentColors'
import { cn } from '~/lib/utils'
import { clamp } from '~/utils/math'

import AlphaPercentScrubber from './AlphaPercentScrubber.vue'
import ColorPickerPanel from './ColorPickerPanel.vue'
import ColorSwatchBox from './ColorSwatchBox.vue'
import ColorValueField from './ColorValueField.vue'
import { formatHexText, formatHexValue, hasExplicitAlpha, normalizeHexText } from './hex-text'

import type { HTMLAttributes } from 'vue'

// 手动把非 prop 属性落到触发按钮上（Popover 子树是多根 Fragment，自动透传会被丢弃）
defineOptions({
  inheritAttrs: false,
})

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

const color = defineModel<string>({ default: '' })
const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  /** 拖拽中的实时值（每帧最多一次），透传面板的实时流供实时预览使用 */
  preview: [value: string]
}>()

const { t } = useI18n()
const { remember } = useRecentColors()

// 关闭时记录最终颜色到最近使用（与 effect 编辑器的 flush 生命周期对齐）
watch(() => open.value, (value, previous) => {
  if (previous && !value) {
    remember(color.value)
  }
})

// 空值或非法值不展示色值，由色块上的斜线表示"未设置"
const parsedColor = $computed(() => {
  try {
    return parseColor(color.value)
  } catch {
    return
  }
})

// hex 字段只展示/编辑 RGB 部分（不带 `#`），透明度由 % 字段负责
const hexText = $computed(() => parsedColor ? formatHexText(parsedColor) : '')
const alphaText = $computed(() => parsedColor ? String(Math.round(parsedColor.alpha * 100)) : '')

// 透明度百分比：字段提交与 % 拖拽共用同一写入路径。
// 透明度是颜色的修饰而非独立值——空值态下没有可修饰的对象，写入只能凭空补一个基色，
// 因此这里直接拒绝写入，控件同时表现为不可用；字段输入可能越界，统一在此裁剪到 0-100
const alphaPercent = computed<number>({
  get: () => (parsedColor ? parsedColor.alpha * 100 : 100),
  set: (percent) => {
    const base = parsedColor
    if (!base) {
      return
    }

    color.value = formatHexValue({ ...base, alpha: clamp(percent, 0, 100) / 100 })
  },
})

// hex 字段是参数值编辑器：空提交表示"回到未设置"（与其他参数输入框清空即移除参数一致），
// 面板的色值框不属于这条契约——它在边界上把空值归一成自己的基线色，空提交按非法输入回退
function commitHexText(text: string) {
  if (!text.trim()) {
    // 已经是空值时不重复写入，避免仅输入空白就向上提交一次无变化的值
    if (color.value !== '') {
      color.value = ''
    }
    return
  }

  try {
    const next = normalizeHexText(text)
    // 自带透明度的输入（8 位 hex、函数式第 4 分量）采用输入值——粘贴整串色值时透明度要一并生效；
    // 只写 RGB 的输入沿用当前透明度，透明度仍由 % 字段负责
    const alpha = hasExplicitAlpha(text) ? next.alpha : (parsedColor?.alpha ?? 1)

    color.value = formatHexValue({ ...next, alpha: disableAlpha ? 1 : alpha })
  } catch {
    // 非法输入保持原值，字段回退到展示文本
  }
}

// 透明度字段提交时以当前颜色为基底；空值态由 setter 拒绝写入
function commitAlphaText(text: string) {
  const percent = Number.parseFloat(text)
  if (Number.isNaN(percent)) {
    return
  }

  alphaPercent.value = percent
}

/**
 * 面板按工具面板对待：应用侧主动移动焦点（可视化编辑器撤销后会聚焦所选语句卡片）
 * 不应把面板关掉，否则撤销一次就得重开面板。关闭仍由点击面板外与 Esc 负责。
 */
function keepPanelOpenOnFocusOutside(event: Event) {
  event.preventDefault()
}

// 触发器各字段都不参与剩余宽度分配，胶囊因此可以收缩到内容宽度
const triggerFieldClass = 'h-full flex-none px-1 text-xs'
// 色值框按内容自适应（fit）：不预留最长值的空档，占位符也不会被截断。
// 下限取 6 位 hex 的宽度（min-w-14：内容 48px），空值态和只输入首字符时都不会塌陷，也盖住中文占位符；
// 上限只挡住无效草稿撑宽。不支持 field-sizing 的环境回退到 6 位裸 hex 的固定宽度（w-16）
const hexFieldClass = 'w-16 min-w-14 max-w-24 supports-[field-sizing:content]:w-auto supports-[field-sizing:content]:field-sizing-content'
// 透明度框：分割线由左边框充当，self-stretch + 负外边距跨过容器内边距（p-0.5）；宽度按最长值 100 取齐
const alphaFieldClass = 'h-auto self-stretch -my-0.5 w-8 text-right border-l border-border tabular-nums'
</script>

<template>
  <Popover ::open="open">
    <InputGroup :class="cn('w-fit h-6 min-w-7 gap-0.5 p-0.5', rootClass)">
      <InputGroupAddon align="inline-start" class="p-0 self-stretch has-[>button]:ml-0">
        <PopoverTrigger as-child>
          <button
            v-bind="$attrs"
            :id="id"
            type="button"
            class="rounded-sm shrink-0 h-full aspect-square focus-visible:outline-none"
          >
            <ColorSwatchBox :color="color" class="rounded-sm h-full w-full ring-1 ring-foreground/10 ring-inset" />
          </button>
        </PopoverTrigger>
      </InputGroupAddon>

      <ColorValueField
        :text="hexText"
        :placeholder="t('common.notSelected')"
        :class="cn(triggerFieldClass, hexFieldClass)"
        aria-label="HEX"
        data-testid="color-picker-hex-field"
        @commit="commitHexText"
      />

      <template v-if="!disableAlpha">
        <ColorValueField
          :text="alphaText"
          type="number"
          :min="0"
          :max="100"
          :disabled="!parsedColor"
          :class="cn(triggerFieldClass, alphaFieldClass)"
          :aria-label="t('common.colorPicker.alpha')"
          data-testid="color-picker-row-alpha-field"
          @commit="commitAlphaText"
        />
        <AlphaPercentScrubber
          ::percent="alphaPercent"
          :disabled="!parsedColor"
          class="pr-0.5"
          data-testid="color-picker-row-alpha-scrubber"
        />
      </template>
    </InputGroup>

    <PopoverContent
      class="p-3 rounded-md w-auto shadow-md"
      :side-offset="8"
      @focus-outside="keepPanelOpenOnFocusOutside"
    >
      <ColorPickerPanel
        ::="color"
        :disable-alpha="disableAlpha"
        @preview="emit('preview', $event)"
      />
    </PopoverContent>
  </Popover>
</template>
