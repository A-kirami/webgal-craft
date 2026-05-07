<script setup lang="ts">
import { ChartSpline, FileText, Image as ImageIcon, Layers, Link2, Palette } from '@lucide/vue'

import { fsCmds } from '~/commands/fs'
import { useTemplateLabel } from '~/composables/useTemplateLabel'
import { db } from '~/database/db'
import { AbsPath } from '~/domain/path'
import {
  calculateEditorStatusBarTextStats,
  isEditorStatusBarImagePreview,
  isEditorStatusBarSaved,
  resolveEditorStatusBarFileLanguage,
  resolveEditorStatusBarMetrics,
  shouldShowEditorStatusBarRelativeTime,
} from '~/features/editor/status-bar/editor-status-bar'
import { formatEngineLabel } from '~/lib/engine-label'
import dayjs from '~/plugins/dayjs'
import { getLanguageDisplayName } from '~/plugins/editor'
import { isEngineUsable } from '~/services/engine-manager'
import {
  isEditableEditor,
  useEditorStore,
} from '~/stores/editor'
import { useModalStore } from '~/stores/modal'
import { useWorkspaceStore } from '~/stores/workspace'
import { handleError } from '~/utils/error-handler'
import { formatFileSize } from '~/utils/format'

const { t, locale } = useI18n()

const editorStore = useEditorStore()
const workspaceStore = useWorkspaceStore()
const modalStore = useModalStore()

const currentState = $computed(() => editorStore.currentState)

const isEngineBound = $computed(() => !!workspaceStore.currentGame?.engineId)

let engineLabel = $ref<string>()
watch(() => workspaceStore.currentGame?.engineId, async (engineId) => {
  if (!engineId) {
    engineLabel = undefined
    return
  }
  // 切换 engineId 时立即清空，避免显示旧引擎名
  engineLabel = undefined
  const engine = await db.engines.get(engineId)
  // 异步过程中引擎可能切换，丢弃过时结果
  if (workspaceStore.currentGame?.engineId !== engineId) {
    return
  }
  engineLabel = engine && isEngineUsable(engine) ? formatEngineLabel(engine) : undefined
}, { immediate: true })

function openSwitchEngine() {
  const game = workspaceStore.currentGame
  if (game) {
    modalStore.open('SwitchEngineModal', { game })
  }
}

function openSwitchTemplate() {
  const game = workspaceStore.currentGame
  if (game) {
    modalStore.open('SwitchTemplateModal', { game })
  }
}

const { label: templateLabel, followingEngine: isFollowingEngine } = useTemplateLabel()

const editableState = $computed(() =>
  currentState && isEditableEditor(currentState) ? currentState : undefined,
)
const previewState = $computed(() => {
  const state = currentState
  return state && !isEditableEditor(state) && state.view === 'preview' ? state : undefined
})

const isImagePreview = $computed(() => isEditorStatusBarImagePreview(previewState))

let imageWidth = $ref<number>()
let imageHeight = $ref<number>()

watch(() => previewState?.path, async (path) => {
  imageWidth = undefined
  imageHeight = undefined

  if (!path || !isImagePreview) {
    return
  }

  try {
    const [w, h] = await fsCmds.getImageDimensions(AbsPath.from(path))
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
const isSaved = $computed(() => isEditorStatusBarSaved(editableState))
const lastSavedTime = $computed(() => editableState?.lastSavedTime)

const shouldShowTime = $computed(() => shouldShowEditorStatusBarRelativeTime(isSaved, lastSavedTime))
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
const fileLanguage = $computed(() =>
  resolveEditorStatusBarFileLanguage(editableState, {
    getLanguageDisplayName,
    t,
  }),
)

const textContent = $computed(() => editableState?.projection === 'text' ? editableState.textContent : '')

let wordCount = $ref(0)
let lineCount = $ref(0)
const metrics = $computed(() => resolveEditorStatusBarMetrics(editableState, {
  lineCount,
  wordCount,
}))
const isSceneMode = $computed(() => metrics?.kind === 'scene')
const isAnimationMode = $computed(() => metrics?.kind === 'animation')
const statementCount = $computed(() => metrics?.kind === 'scene' ? metrics.count : 0)
const frameCount = $computed(() => metrics?.kind === 'animation' ? metrics.count : 0)

function updateStats() {
  const nextStats = calculateEditorStatusBarTextStats(textContent)
  wordCount = nextStats.wordCount
  lineCount = nextStats.lineCount
}

// 切换文件或编辑模式时立即计算；同一文件内编辑时防抖计算
watch(() => [currentState?.path, editableState?.projection], updateStats, { immediate: true })
watchDebounced(() => textContent, updateStats, { debounce: 500, maxWait: 1000 })
</script>

<template>
  <div class="text-xs px-3 border-t bg-gray-50 flex h-6 items-center dark:bg-gray-900">
    <div class="flex gap-3 min-w-0 items-center">
      <button
        v-if="isEngineBound"
        class="text-muted-foreground flex gap-1 cursor-pointer transition-colors items-center hover:text-foreground"
        @click="openSwitchEngine"
      >
        <Layers class="h-3 w-3" :stroke-width="1.5" />
        <span class="max-w-30 truncate">{{ engineLabel ?? $t('edit.statusBar.engineMissing') }}</span>
      </button>

      <button
        v-if="isEngineBound && (templateLabel || isFollowingEngine)"
        class="text-muted-foreground flex gap-1 cursor-pointer transition-colors items-center hover:text-foreground"
        :title="isFollowingEngine
          ? $t('edit.statusBar.templateFollowing')
          : $t('edit.statusBar.template')"
        @click="openSwitchTemplate"
      >
        <Palette class="h-3 w-3" :stroke-width="1.5" />
        <span class="max-w-30 truncate">{{ templateLabel ?? $t('edit.statusBar.templateMissing') }}</span>
        <Link2 v-if="isFollowingEngine" class="h-3 w-3" :stroke-width="1.5" />
      </button>
    </div>

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
        <span v-else-if="isAnimationMode" class="font-medium">
          {{ $t('edit.statusBar.frames', { count: frameCount }) }}
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
