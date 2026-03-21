<script setup lang="ts">
import { countLines, countWords } from 'alfaaz'
import { ChartSpline, FileText, Image as ImageIcon } from 'lucide-vue-next'

import dayjs from '~/plugins/dayjs'
import { getLanguageDisplayName } from '~/plugins/editor'

const { t, locale } = useI18n()

const editorStore = useEditorStore()

const currentState = $computed(() => editorStore.currentState)

const editableState = $computed(() =>
  currentState && isEditableEditor(currentState) ? currentState : undefined,
)
const previewState = $computed(() =>
  currentState && !isEditableEditor(currentState) && currentState.view === 'preview'
    ? currentState
    : undefined,
)

const isImagePreview = $computed(() =>
  previewState?.mimeType.startsWith('image/') ?? false,
)

let imageWidth = $ref<number>()
let imageHeight = $ref<number>()

watch(() => previewState?.path, async (path) => {
  imageWidth = undefined
  imageHeight = undefined

  if (!path || !isImagePreview) {
    return
  }

  try {
    const [w, h] = await thumbnailCmds.getImageDimensions(path)
    // 异步完成后路径可能已变，丢弃过时结果
    if (previewState?.path !== path) {
      return
    }
    imageWidth = w
    imageHeight = h
  } catch (error) {
    handleError(error, { silent: true })
  }
}, { immediate: true })

// 是否已保存
const isSaved = $computed(() => !(editableState?.isDirty ?? false))

// 上次保存时间
const lastSavedTime = $computed(() => editableState?.lastSavedTime)

// 相对时间显示
const shouldShowTime = $computed(() => isSaved && !!lastSavedTime)
const { now, pause, resume } = useNow({
  interval: 30 * 1000,
  controls: true,
})

watch(() => shouldShowTime, (show) => {
  if (show) {
    resume()
  } else {
    pause()
  }
}, { immediate: true })

const relativeTime = $computed(() => {
  // now 和 locale 作为响应式依赖，确保定时刷新和语言切换时重算
  void now.value
  void locale.value
  return shouldShowTime && lastSavedTime
    ? dayjs(lastSavedTime).fromNow()
    : undefined
})

// 文件语言显示
const fileLanguage = $computed(() => {
  if (!editableState) {
    return ''
  }
  switch (editableState.kind) {
    case 'scene': {
      return t('edit.textEditor.languages.webgalscript')
    }
    case 'animation': {
      return t('edit.textEditor.languages.webgalanimation')
    }
    default: {
      return getLanguageDisplayName(editableState.path)
    }
  }
})

// 文本内容（用于统计）
const textContent = $computed(() => editableState?.projection === 'text' ? editableState.textContent : '')

// 是否为可视化场景模式
const isSceneMode = $computed(() => editableState !== undefined && isSceneVisualProjection(editableState))

// 语句数（可视化场景模式）
const statementCount = $computed(() =>
  editableState && isSceneVisualProjection(editableState)
    ? editableState.statements.length
    : 0,
)

// 行数和字数
let wordCount = $ref(0)
let lineCount = $ref(0)

function updateStats() {
  wordCount = countWords(textContent)
  lineCount = countLines(textContent)
}

// 切换文件或编辑模式时立即计算
watch(() => [currentState?.path, editableState?.projection], updateStats, { immediate: true })

// 同一文件内编辑时防抖计算
watchDebounced(() => textContent, updateStats, { debounce: 500, maxWait: 1000 })
</script>

<template>
  <div class="text-xs px-3 border-t bg-gray-50 flex h-6 items-center dark:bg-gray-900">
    <!-- 左侧：应用级信息（引擎版本等，暂留空，后续扩展） -->
    <div class="flex gap-3 items-center" />

    <!-- 右侧：文本/可视化编辑器信息 -->
    <div v-if="editableState" class="ml-auto flex gap-3 items-center">
      <!-- 保存状态 -->
      <div class="flex gap-1.5 items-center">
        <div
          :class="[
            'h-2 w-2 rounded-full',
            isSaved ? 'bg-green-500' : 'bg-amber-500',
          ]"
          :title="isSaved ? $t('common.saved') : $t('common.unsaved')"
        />
        <span class="text-muted-foreground">
          {{ isSaved ? $t('common.saved') : $t('common.unsaved') }}
          <span v-if="shouldShowTime" class="text-xs ml-1 opacity-70">{{ relativeTime }}</span>
        </span>
      </div>

      <!-- 文件语言 -->
      <div v-if="fileLanguage" class="flex gap-1 items-center">
        <FileText class="text-muted-foreground h-3 w-3" :stroke-width="1" />
        <span class="font-medium">{{ fileLanguage }}</span>
      </div>

      <!-- 统计 -->
      <div class="flex gap-1 items-center">
        <ChartSpline class="text-muted-foreground h-3 w-3" />
        <span v-if="isSceneMode" class="font-medium">
          {{ $t('edit.statusBar.statements', { count: statementCount }) }}
        </span>
        <template v-else>
          <span class="font-medium">
            {{ $t('edit.textEditor.stats.lines', { count: lineCount }) }}
          </span>
          <span class="font-medium">
            {{ $t('edit.textEditor.stats.words', { count: wordCount }) }}
          </span>
        </template>
      </div>
    </div>

    <!-- 右侧：资源预览信息 -->
    <div v-else-if="previewState" class="ml-auto flex gap-3 items-center">
      <!-- 图片分辨率 -->
      <div v-if="isImagePreview && imageWidth && imageHeight" class="flex gap-1 items-center">
        <ImageIcon class="text-muted-foreground h-3 w-3" :stroke-width="1" />
        <span class="font-medium">{{ imageWidth }} × {{ imageHeight }}</span>
      </div>

      <!-- 文件大小 -->
      <span v-if="previewState.fileSize !== undefined" class="text-muted-foreground font-medium">
        {{ formatFileSize(previewState.fileSize) }}
      </span>
    </div>
  </div>
</template>
