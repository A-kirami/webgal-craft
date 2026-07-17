<script setup lang="ts">
import {
  ComboboxInput,
  injectComboboxRootContext,
  injectListboxRootContext,
} from 'reka-ui'

const props = defineProps<{
  openOnPointer?: boolean
}>()

const MANUAL_HIGHLIGHT_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End'])

const rootContext = injectComboboxRootContext()
const listboxContext = injectListboxRootContext()
let hasManualHighlightIntent = false
let isComposing = false

function markHighlightIntent() {
  hasManualHighlightIntent = true
}

function resetHighlightIntent() {
  hasManualHighlightIntent = false
}

function clearHighlightedSuggestion(event = new Event('autocomplete.clear-highlight')) {
  if (listboxContext.highlightedElement.value) {
    listboxContext.onLeave(event)
  }
}

// Reka 会自动高亮首个筛选结果；手动选择模式只允许用户显式导航后出现 active option。
watch(listboxContext.highlightedElement, (highlightedElement) => {
  if (highlightedElement && !hasManualHighlightIntent) {
    clearHighlightedSuggestion()
  }
})

function focus() {
  rootContext.inputElement.value?.focus()
}

function canOpen(event: PointerEvent): boolean {
  const input = event.currentTarget as HTMLInputElement
  return Boolean(props.openOnPointer)
    && !rootContext.open.value
    && !input.disabled
}

// 关联 label 不产生指针事件，因此只在直接操作输入框时展开候选项。
function handlePointerDown(event: PointerEvent) {
  if (
    canOpen(event)
    && event.pointerType !== 'touch'
    && event.button === 0
    && !event.ctrlKey
  ) {
    rootContext.onOpenChange(true)
  }
}

function handlePointerUp(event: PointerEvent) {
  if (canOpen(event) && event.pointerType === 'touch') {
    rootContext.onOpenChange(true)
  }
}

function handleInputCapture(event: InputEvent) {
  resetHighlightIntent()
  clearHighlightedSuggestion(event)
}

function handleCompositionStartCapture(event: CompositionEvent) {
  isComposing = true
  resetHighlightIntent()
  clearHighlightedSuggestion(event)
}

function handleCompositionEndCapture() {
  isComposing = false
  resetHighlightIntent()
}

function handleKeydownCapture(event: KeyboardEvent) {
  if (isComposing || event.isComposing || !MANUAL_HIGHLIGHT_KEYS.has(event.key)) {
    return
  }

  if (!rootContext.open.value && (event.key === 'Home' || event.key === 'End')) {
    return
  }

  markHighlightIntent()
}

defineExpose({
  focus,
  markHighlightIntent,
  resetHighlightIntent,
})
</script>

<template>
  <ComboboxInput
    @compositionend.capture="handleCompositionEndCapture"
    @compositionstart.capture="handleCompositionStartCapture"
    @input.capture="handleInputCapture"
    @keydown.capture="handleKeydownCapture"
    @pointerdown="handlePointerDown"
    @pointerup="handlePointerUp"
  />
</template>
