<script setup lang="ts">
interface Props {
  modelValue?: string | number
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
})

const emit = defineEmits<{
  'commit': [value: string]
  'update:modelValue': [value: string]
}>()

let draftValue = $ref(String(props.modelValue))
let hasUncommittedDraft = $ref(false)
let preserveDraftForCurrentInput = $ref(false)

watch(
  () => props.modelValue,
  (value) => {
    if (preserveDraftForCurrentInput) {
      return
    }

    hasUncommittedDraft = false
    draftValue = String(value)
  },
)

function updateDraft(value: string | number): void {
  hasUncommittedDraft = true
  preserveDraftForCurrentInput = true
  draftValue = String(value ?? '')
  emit('update:modelValue', draftValue)

  // 仅忽略当前输入触发的父级归一化回写，保留用户刚输入的原始文本。
  void nextTick(() => {
    preserveDraftForCurrentInput = false
  })
}

function commitDraft(): void {
  if (!hasUncommittedDraft) {
    return
  }

  const value = draftValue
  hasUncommittedDraft = false
  preserveDraftForCurrentInput = false
  emit('commit', value)

  void nextTick(() => {
    if (!hasUncommittedDraft) {
      draftValue = String(props.modelValue)
    }
  })
}
</script>

<template>
  <Input
    data-slot="input-group-control"
    class="border-0 rounded-none bg-transparent flex-1 ring-offset-transparent dark:bg-transparent focus-visible:ring-0 focus-visible:ring-transparent"
    type="text"
    inputmode="decimal"
    :model-value="draftValue"
    @update:model-value="updateDraft"
    @blur="commitDraft"
    @keydown.enter="commitDraft"
  />
</template>
