<script setup lang="ts">
import { FileWarning, Save } from '@lucide/vue'

import ReferencedAnimationEditorPanel from '~/components/editor/animation/ReferencedAnimationEditorPanel.vue'
import { resolveAnimationFramePreviewNotice, useAnimationFramePreviewNotice } from '~/features/editor/animation/useAnimationFramePreviewNotice'
import { useShortcut } from '~/features/editor/shortcut/useShortcut'
import { useEditSettingsStore } from '~/stores/edit-settings'
import { usePreferenceStore } from '~/stores/preference'
import { usePreviewSyncStore } from '~/stores/preview-sync'

import type { ReferencedAnimationEditorController } from '~/features/editor/animation/useReferencedAnimationEditor'

interface Props {
  /** 抽屉锚定的编辑面板容器 */
  anchor?: HTMLElement
  controller: ReferencedAnimationEditorController
  /** 预览区在浮层可用时保持可交互；与效果编辑器、语句动画抽屉共用同一个契约 */
  interactiveRegionSelector?: string
  previewFieldValue?: (path: string) => string | undefined
}

const props = defineProps<Props>()

const { t } = useI18n()

const editSettingsStore = useEditSettingsStore()
const preferenceStore = usePreferenceStore()
const previewSyncStore = usePreviewSyncStore()

// 面板是加载完成后才挂载的；静态降级原因在打开时就能判定，先渲染同一行，避免面板挂载后头部增高
const isFramePreviewActive = $computed(() =>
  props.controller.isOpen
  && (props.controller.status === 'loading' || props.controller.status === 'ready')
  && props.controller.binding?.framePreview !== undefined,
)
const earlyFramePreviewNotice = useAnimationFramePreviewNotice(() => {
  if (!isFramePreviewActive) {
    return
  }

  return resolveAnimationFramePreviewNotice({
    baselineResolved: false,
    baselineSource: 'unknown',
    context: props.controller.binding?.framePreview,
    enableLivePreview: editSettingsStore.enableLivePreview,
    hasFrame: true,
    isOpen: props.controller.isOpen,
    previewReady: previewSyncStore.isPreviewReady,
    seekFailed: false,
    showPreviewPanel: preferenceStore.showPreviewPanel,
  })
})

// 面板挂载后接管动态原因（基线不可用、seek 失败）；在此之前用静态原因占住同一行
let panelFramePreviewNotice = $ref<string>()
let panelNoticeReported = $ref(false)
const displayedFramePreviewNotice = $computed(() =>
  panelNoticeReported ? panelFramePreviewNotice : earlyFramePreviewNotice.value,
)

function handlePanelFramePreviewNotice(notice: string | undefined): void {
  panelNoticeReported = true
  panelFramePreviewNotice = notice
}

const contentRef = useTemplateRef<HTMLElement>('contentRef')

// 抽屉打开即接管焦点：加载中/空状态下也要让快捷键上下文成立，不依赖触发按钮留在焦点上
watch(
  () => props.controller.isOpen,
  (isOpen) => {
    if (!isOpen) {
      // 面板卸载后不会再发新提示；清掉上一会话的降级原因，避免下次打开沿用旧面板的提示
      panelFramePreviewNotice = undefined
      panelNoticeReported = false
      return
    }
    void nextTick(() => contentRef.value?.focus({ preventScroll: true }))
  },
  { immediate: true },
)

const title = $computed(() => {
  const name = props.controller.animationName
  return name
    ? t('edit.visualEditor.animation.referenced.title', { name })
    : t('edit.visualEditor.animation.referenced.titleFallback')
})

// 引用计数是描述的一部分：说明这份文件是什么、改动会影响谁；不单独占一行提示
const description = $computed(() =>
  props.controller.referenceCount > 1
    ? t('edit.visualEditor.animation.referenced.descriptionWithCount', {
        count: props.controller.referenceCount,
      })
    : t('edit.visualEditor.animation.referenced.description'),
)

const stateTitle = $computed(() => {
  switch (props.controller.status) {
    case 'unresolved': {
      return t('edit.visualEditor.animation.referenced.unresolvedTitle')
    }
    case 'v2-read-only': {
      return t('edit.visualEditor.animation.referenced.readOnlyTitle')
    }
    case 'invalid-json': {
      return t('edit.visualEditor.animation.referenced.invalidTitle')
    }
    default: {
      return t('edit.visualEditor.animation.referenced.loadFailedTitle')
    }
  }
})

const stateMessage = $computed(() => {
  switch (props.controller.status) {
    case 'unresolved': {
      switch (props.controller.unresolvedReason) {
        case 'dynamic-name': {
          return t('edit.visualEditor.animation.referenced.unresolved.dynamicName')
        }
        case 'invalid-path': {
          return t('edit.visualEditor.animation.referenced.unresolved.invalidPath')
        }
        case 'reserved-name': {
          return t('edit.visualEditor.animation.referenced.unresolved.reservedName')
        }
        default: {
          return t('edit.visualEditor.animation.referenced.unresolved.empty')
        }
      }
    }
    case 'v2-read-only': {
      return t('edit.visualEditor.animation.referenced.v2ReadOnlyDescription')
    }
    case 'invalid-json': {
      return t('edit.visualEditor.animation.referenced.invalidDescription')
    }
    default: {
      return t('edit.visualEditor.animation.referenced.loadFailedDescription')
    }
  }
})

function handleOpenChange(nextOpen: boolean): void {
  if (nextOpen) {
    return
  }
  props.controller.requestClose()
}

async function handleSave(): Promise<void> {
  await props.controller.save()
}

useShortcut({
  allowInEditorDrawer: true,
  allowInInput: true,
  execute: () => {
    props.controller.requestClose()
  },
  i18nKey: 'shortcut.animation.close',
  id: 'animationFile.close',
  keys: 'Escape',
  when: { panelFocus: 'animationFileEditor' },
})

useShortcut({
  allowInEditorDrawer: true,
  allowInInput: true,
  execute: () => {
    void handleSave()
  },
  i18nKey: 'shortcut.save',
  id: 'animationFile.save',
  keys: 'Mod+S',
  when: { panelFocus: 'animationFileEditor' },
})
</script>

<template>
  <EditorDrawer
    :anchor="props.anchor"
    :interactive-region-selector="props.interactiveRegionSelector"
    :open="props.controller.isOpen"
    panel-focus="animationFileEditor"
    class="p-4 max-w-full w-160 sm:max-w-full"
    @update:open="handleOpenChange"
  >
    <div ref="contentRef" tabindex="-1" class="outline-none flex flex-col h-full">
      <SheetHeader class="pr-8 gap-y-0.5">
        <SheetTitle>{{ title }}</SheetTitle>
        <SheetDescription class="text-13px!">
          {{ description }}
        </SheetDescription>
      </SheetHeader>
      <p
        v-if="displayedFramePreviewNotice"
        role="status"
        data-testid="referenced-animation-frame-preview-notice"
        class="text-xs text-muted-foreground mt-2 flex gap-1.5 items-start"
      >
        <span class="i-lucide-info mt-0.5 shrink-0 size-3.5" />
        <span>{{ displayedFramePreviewNotice }}</span>
      </p>
      <Separator class="mb-4 mt-2" />

      <div class="flex-1 min-h-0">
        <p
          v-if="props.controller.status === 'loading'"
          role="status"
          data-testid="referenced-animation-loading"
          class="text-sm text-muted-foreground"
        >
          {{ $t('edit.visualEditor.animation.referenced.loading') }}
        </p>

        <ReferencedAnimationEditorPanel
          v-else-if="props.controller.status === 'ready' && props.controller.draftFrames"
          :frame-preview-notice="panelFramePreviewNotice"
          :frame-preview="props.controller.binding?.framePreview"
          :frames="props.controller.draftFrames"
          :preview-field-value="props.previewFieldValue"
          @update:frame-preview-notice="handlePanelFramePreviewNotice"
          @update:frames="props.controller.updateDraftFrames"
        />

        <Empty v-else class="border-0 h-full" data-testid="referenced-animation-unavailable">
          <EmptyContent>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileWarning />
              </EmptyMedia>
              <EmptyTitle>{{ stateTitle }}</EmptyTitle>
              <EmptyDescription>{{ stateMessage }}</EmptyDescription>
            </EmptyHeader>
            <div class="flex flex-wrap gap-2 justify-center">
              <Button
                v-if="props.controller.status === 'load-failed'"
                variant="outline"
                @click="props.controller.retry()"
              >
                {{ $t('edit.visualEditor.animation.referenced.retry') }}
              </Button>
              <Button
                v-if="props.controller.status === 'v2-read-only' || props.controller.status === 'invalid-json'"
                variant="outline"
                data-testid="open-referenced-animation-in-text-mode"
                @click="props.controller.openInTextMode()"
              >
                {{ $t('edit.visualEditor.animation.referenced.openInTextMode') }}
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      </div>

      <div v-if="props.controller.status === 'ready'" class="mt-4 flex items-center justify-end">
        <Button
          size="sm"
          :disabled="!props.controller.isDirty"
          data-testid="save-referenced-animation-file"
          @click="handleSave"
        >
          <Save aria-hidden="true" />
          {{ $t('common.save') }}
        </Button>
      </div>
    </div>
  </EditorDrawer>
</template>
