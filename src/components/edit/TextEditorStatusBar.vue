<script setup lang="tsx">
import { countLines, countWords } from 'alfaaz'
import { ChartSpline, FileText } from 'lucide-vue-next'

const props = defineProps<{
  isSaved: boolean
  content: string
}>()

let wordCount = $ref(0)
let lineCount = $ref(0)

// 使用节流进行快速更新
const updateCountsThrottled = useThrottleFn(() => {
  wordCount = countWords(props.content)
  lineCount = countLines(props.content)
}, 500)

// 使用防抖进行最终更新
const updateCountsDebounced = useDebounceFn(() => {
  wordCount = countWords(props.content)
  lineCount = countLines(props.content)
}, 1000)

watch(() => props.content, () => {
  // 先进行节流更新
  updateCountsThrottled()
  // 然后进行防抖更新
  updateCountsDebounced()
}, { immediate: true })
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
          :title="isSaved ? '已保存' : '未保存'"
        />
        <span class="text-muted-foreground">{{ isSaved ? '已保存' : '未保存' }}</span>
      </div>
    </div>

    <div class="ml-auto flex gap-3 items-center">
      <div class="flex gap-1 items-center">
        <div class="flex gap-1 items-center">
          <FileText class="text-muted-foreground h-3 w-3" :stroke-width="1" />
          <span class="font-medium">WebGAL 脚本</span>
        </div>
        <ChartSpline class="text-muted-foreground h-3 w-3" />
        <span class="flex gap-2 items-center">
          <span class="font-medium">{{ lineCount }} 行,</span>
          <span class="font-medium">{{ wordCount }} 字</span>
        </span>
      </div>
    </div>
  </div>
</template>
