<script setup lang="tsx">
import { countLines, countWords } from 'alfaaz'
import { ChartSpline, FileText } from 'lucide-vue-next'

const props = defineProps<{
  isSaved: boolean
  content: string
  fileLanguage: string
}>()

let wordCount = $ref(0)
let lineCount = $ref(0)

// 首次加载时立即计算
onMounted(() => {
  wordCount = countWords(props.content)
  lineCount = countLines(props.content)
})

// 后续变化使用防抖
watchDebounced(() => props.content, () => {
  wordCount = countWords(props.content)
  lineCount = countLines(props.content)
}, { debounce: 500, maxWait: 1000 })
</script>

<template>
  <div class="text-xs px-3 py-2 bg-gray-50 flex items-center dark:bg-gray-900">
    <div class="flex gap-3 items-center">
      <div class="flex gap-1.5 items-center">
        <div
          :class="[
            'h-2 w-2 rounded-full',
            isSaved ? 'bg-green-500' : 'bg-amber-500'
          ]"
          :title="isSaved ? $t('common.saved') : $t('common.unsaved')"
        />
        <span class="text-muted-foreground">{{ isSaved ? $t('common.saved') : $t('common.unsaved') }}</span>
      </div>
    </div>

    <div class="ml-auto flex gap-3 items-center">
      <div class="flex gap-1 items-center">
        <div class="flex gap-1 items-center">
          <FileText class="text-muted-foreground h-3 w-3" :stroke-width="1" />
          <span class="font-medium">{{ fileLanguage }}</span>
        </div>
        <ChartSpline class="text-muted-foreground h-3 w-3" />
        <span class="flex gap-2 items-center">
          <span class="font-medium">{{ $t('edit.textEditor.stats.lines', { count: lineCount }) }}</span>
          <span class="font-medium">{{ $t('edit.textEditor.stats.words', { count: wordCount }) }}</span>
        </span>
      </div>
    </div>
  </div>
</template>
