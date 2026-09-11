<script setup lang="ts">
import { colorToString, convertToRgb, parseColor } from 'reka-ui'

import { cn } from '~/lib/utils'

import type { HTMLAttributes } from 'vue'

interface Props {
  class?: HTMLAttributes['class']
  color?: string
}

const {
  class: rootClass,
  color = '',
} = defineProps<Props>()

// 非法/空颜色不渲染色块，由 CSS 的 [data-empty] 规则换成"未设置"斜线
const rgbColor = $computed(() => {
  if (!color) {
    return
  }
  try {
    return convertToRgb(parseColor(color))
  } catch {
    return
  }
})

// 左半：alpha = 1 的基色；右半：棋盘衬底上的实际颜色（alpha = 1 时两半同色无缝）
const baseColor = $computed(() => {
  if (!rgbColor) {
    return 'transparent'
  }
  return colorToString({ ...rgbColor, alpha: 1 }, 'hex')
})

const actualColor = $computed(() => {
  if (!rgbColor) {
    return 'transparent'
  }
  return colorToString(rgbColor, 'rgb')
})
</script>

<template>
  <span
    role="presentation"
    :data-empty="rgbColor ? undefined : 'true'"
    :class="cn($style.colorSwatchBox, rootClass)"
    :style="{
      '--swatch-base': baseColor,
      '--swatch-actual': actualColor,
    }"
  />
</template>

<style module>
.color-swatch-box {
  display: block;
  background-color: var(--color-white, #ffffff);
  background-image:
    linear-gradient(to right, var(--swatch-base) 50%, transparent 50%),
    linear-gradient(to right, transparent 50%, var(--swatch-actual) 50%),
    repeating-conic-gradient(rgb(0 0 0 / 15%) 0% 25%, transparent 0% 50%);

  /* 背景默认裁剪到 border-box，会在半透明边框下露出渐变重复平铺的下一块（右边缘出现基色竖线），裁剪到 padding-box 避免 */
  background-clip: padding-box;
  background-size: 100% 100%, 100% 100%, 8px 8px;
}

/* 无有效颜色：背景保持透明（不铺棋盘格衬底），只画一道斜线表示"未设置"。
   端点内缩 2px，避免斜线顶到色块圆角处看起来越过边界；
   带宽 0.7px：45° 斜线的竖直投影是垂直厚度的 √2 倍，取 0.7px 时投影像 1px 细线；
   颜色带字面量兜底：var() 解析失败会让整条 background-image 失效，标识会静默消失 */
.color-swatch-box[data-empty] {
  --swatch-slash-color: oklch(var(--destructive, 0.577 0.245 27.325));

  background-color: transparent;
  background-image: linear-gradient(to bottom right, transparent calc(50% - 1px), var(--swatch-slash-color) calc(50% - 1px), var(--swatch-slash-color) calc(50% + 1px), transparent calc(50% + 1px));
  background-repeat: no-repeat;
  background-position: center;
  background-size: calc(100% - 4px) calc(100% - 4px);
}
</style>
