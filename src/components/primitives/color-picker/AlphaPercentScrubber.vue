<script setup lang="ts">
import { inputGroupAddonVariants } from '~/components/ui/input-group'
import { useImmediatePointerDrag } from '~/composables/useImmediatePointerDrag'
import { cn } from '~/lib/utils'
import { applyScrubStepModifier, clamp, roundByStep } from '~/utils/math'

import type { HTMLAttributes } from 'vue'

interface Props {
  class?: HTMLAttributes['class']
  /** 没有可修饰的颜色时禁用：既不调整百分比，也不把焦点交给左侧字段 */
  disabled?: boolean
}

const { class: rootClass, disabled = false } = defineProps<Props>()

/** 透明度百分比（0-100）；左右拖拽按 1%/px 调整，Alt/Shift 改变步进 */
const percent = defineModel<number>('percent', { required: true })

interface ScrubState {
  startX: number
  startPercent: number
  lastPercent: number
}

const { start } = useImmediatePointerDrag<ScrubState>({
  onStart(event) {
    if (event.button !== 0 || event.pointerType === 'touch') {
      return
    }

    return { startX: event.clientX, startPercent: percent.value, lastPercent: percent.value }
  },
  onMove(event, state) {
    const step = applyScrubStepModifier(1, event)
    const nextPercent = clamp(roundByStep(state.startPercent + ((event.clientX - state.startX) * step), step), 0, 100)
    if (nextPercent === state.lastPercent) {
      return
    }

    state.lastPercent = nextPercent
    percent.value = nextPercent
  },
  onEnd() { /* 每次移动即时写入，无需收尾 */ },
})

// 按下时把焦点交给 % 左侧的透明度输入框（点击单位标签即聚焦所属字段）。
// 不复用 InputGroupAddon：它的点击行为固定聚焦组内第一个输入框，在触发器会落到色值框、在 RGB 面板会落到 R 框
function handlePointerDown(event: PointerEvent) {
  // 阻止拖拽时选中文本；指针捕获由 useImmediatePointerDrag 接管
  event.preventDefault()

  if (disabled) {
    return
  }

  const field = event.currentTarget instanceof Element ? event.currentTarget.previousElementSibling : undefined
  if (field instanceof HTMLInputElement) {
    field.focus()
  }

  start(event)
}
</script>

<template>
  <div
    role="group"
    data-slot="input-group-addon"
    data-align="inline-end"
    :aria-disabled="disabled || undefined"
    :class="cn(
      inputGroupAddonVariants({ align: 'inline-end' }),
      'text-xs py-0 select-none touch-none',
      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-ew-resize',
      rootClass,
    )"
    @pointerdown="handlePointerDown"
  >
    %
  </div>
</template>
