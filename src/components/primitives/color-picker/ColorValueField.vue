<script setup lang="ts">
interface Props {
  /** 规范化展示文本；空字符串表示未设置 */
  text: string
  /** 原生输入类型；number 时额外响应滚轮与 Home/End */
  type?: 'text' | 'number'
  /** number 字段的取值下限（原生 min，同时是 Home 的落点） */
  min?: number
  /** number 字段的取值上限（原生 max，同时是 End 的落点） */
  max?: number
}

const { max, min, text, type = 'text' } = defineProps<Props>()

const emit = defineEmits<{
  commit: [text: string]
}>()

// 编辑中的草稿文本；undefined 表示跟随 text（外部值变化时放弃草稿）
let draft = $ref<string | undefined>()

watch(() => text, () => {
  draft = undefined
})

// 聚焦时接管当前文本，避免编辑期间被外部值覆盖
function handleFocus() {
  draft = text
}

function handleUpdate(value: string | number) {
  draft = String(value)
}

function handleCommit() {
  const value = draft ?? text

  // 内容没变（仅聚焦后失焦）不提交；提交后回到展示文本，非法输入由父级拒绝并回退
  draft = undefined
  if (value !== text) {
    emit('commit', value)
  }
}

// 数值字段的即时提交：越界值由父级提交路径裁剪，字段回退到提交后的展示文本
function commitNumber(value: number) {
  draft = undefined
  emit('commit', String(value))
}

function handleKeydown(event: KeyboardEvent) {
  // 输入法组合期间的 Enter 用于确认候选，不提交
  if (event.isComposing) {
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    handleCommit()
    return
  }

  // Home/End 跳到取值范围两端（APG spinbutton 约定），代价是覆盖原生"光标移到首/尾"
  if (event.key === 'Home' || event.key === 'End') {
    const boundary = event.key === 'Home' ? min : max
    if (type !== 'number' || boundary === undefined) {
      return
    }

    event.preventDefault()
    commitNumber(boundary)
  }
}

// 滚轮按 1 增减（向下滚动取更小的值，与 Chromium 原生 number 输入一致），并立即提交以便颜色同步变化。
// 只在聚焦时响应：与原生步进一致，避免指针扫过输入框时误改；WebKit 已移除原生步进，故自行处理。
function handleWheel(event: WheelEvent) {
  if (type !== 'number' || event.deltaY === 0 || event.target !== document.activeElement) {
    return
  }

  const current = Number.parseFloat(draft ?? text)
  if (Number.isNaN(current)) {
    return
  }

  // 阻止 Chromium 的原生步进重复响应，以及背景滚动
  event.preventDefault()
  commitNumber(current - Math.sign(event.deltaY))
}
</script>

<template>
  <InputGroupInput
    :type="type"
    :min="min"
    :max="max"
    :model-value="draft ?? text"
    @update:model-value="handleUpdate"
    @focus="handleFocus"
    @blur="handleCommit"
    @keydown="handleKeydown"
    @wheel="handleWheel"
  />
</template>
