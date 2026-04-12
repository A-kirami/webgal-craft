<script setup lang="ts">
import type { AnimationEditorSelectedFrameState, AnimationTimelineResizeDurationPayload } from '~/features/editor/animation/animation-editor-contract'
import type { AnimationEditorKeyframe } from '~/features/editor/animation/animation-inspector'
import type { EffectEditorTransformUpdatePayload } from '~/features/editor/effect-editor/useEffectEditorProvider'

interface Props {
  keyframes: readonly AnimationEditorKeyframe[]
  selectedFrameId: number
  timelineZoomPercent: number
  totalDuration: number
  canDeleteFrame: boolean
  selectedFrame?: AnimationEditorSelectedFrameState
  showHistoryActions?: boolean
  canUndo?: boolean
  canRedo?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  canRedo: false,
  canUndo: false,
  selectedFrame: undefined,
  showHistoryActions: false,
})

const emit = defineEmits<{
  'add-frame': []
  'delete-frame': []
  'undo': []
  'redo': []
  'select-frame': [id: number]
  'zoom-change': [zoomPercent: number]
  'resize-duration': [payload: AnimationTimelineResizeDurationPayload]
  'update:selected-frame-transform': [payload: EffectEditorTransformUpdatePayload]
  'update:selected-frame-duration': [value: string]
  'update:selected-frame-ease': [value: string]
}>()

const inspectorSelectedFrame = $computed<AnimationEditorSelectedFrameState>(() => props.selectedFrame ?? {
  duration: '0',
  ease: '',
  id: props.selectedFrameId,
  isEaseDisabled: true,
  isStartFrame: false,
  transform: {},
})
</script>

<template>
  <div class="bg-background flex flex-col h-full overflow-hidden">
    <div class="flex flex-1 flex-col min-h-0">
      <div class="border-b flex shrink-0 flex-col min-h-0">
        <div class="px-3 py-1.5 flex gap-2 items-center justify-between">
          <div class="flex gap-1.5 items-center">
            <div class="i-lucide-timer text-muted-foreground size-3.5" />
            <h3 class="text-sm font-semibold">
              {{ $t('edit.visualEditor.animation.timelineTitle') }}
            </h3>
          </div>

          <div class="flex flex-wrap gap-1.5 items-center justify-end">
            <Button size="sm" class="px-2.5 gap-1.5 h-7" @click="emit('add-frame')">
              <div class="i-lucide-plus size-3.5" />
              {{ $t('edit.visualEditor.animation.toolbar.addFrame') }}
            </Button>
            <Button size="sm" variant="outline" class="px-2.5 h-7 shadow-none" :disabled="!props.canDeleteFrame" @click="emit('delete-frame')">
              {{ $t('edit.visualEditor.animation.toolbar.delete') }}
            </Button>
            <template v-if="props.showHistoryActions">
              <Separator orientation="vertical" class="mx-0.5 h-4" />
              <Button
                size="icon"
                variant="ghost"
                class="h-7 w-7"
                :disabled="!props.canUndo"
                :title="$t('edit.visualEditor.animation.toolbar.undo')"
                @click="emit('undo')"
              >
                <div class="i-lucide-undo-2 size-3.5" />
                <span class="sr-only">{{ $t('edit.visualEditor.animation.toolbar.undo') }}</span>
              </Button>
              <Button
                size="icon"
                variant="ghost"
                class="h-7 w-7"
                :disabled="!props.canRedo"
                :title="$t('edit.visualEditor.animation.toolbar.redo')"
                @click="emit('redo')"
              >
                <div class="i-lucide-redo-2 size-3.5" />
                <span class="sr-only">{{ $t('edit.visualEditor.animation.toolbar.redo') }}</span>
              </Button>
            </template>
          </div>
        </div>

        <div class="px-3 pt-1 flex-1 min-h-0">
          <AnimationTimeline
            class="h-full min-h-0"
            :keyframes="props.keyframes"
            :selected-id="props.selectedFrameId"
            :total-duration="props.totalDuration"
            @resize-duration="emit('resize-duration', $event)"
            @select="emit('select-frame', $event)"
            @zoom-change="emit('zoom-change', $event)"
          />
        </div>

        <div class="px-3 pb-2.5 pt-1.5 flex justify-end">
          <div class="text-xs text-muted-foreground flex gap-3 whitespace-nowrap items-center">
            <span>{{ $t('edit.visualEditor.animation.toolbar.zoom') }} {{ props.timelineZoomPercent }}%</span>
            <span>{{ $t('edit.visualEditor.animation.toolbar.totalDuration') }} {{ props.totalDuration }}{{ $t('edit.visualEditor.animation.unitMs') }}</span>
          </div>
        </div>
      </div>

      <div v-if="props.keyframes.length > 0" class="px-3 flex flex-1 flex-col min-h-0">
        <div class="py-2.5 flex gap-1.5 items-center">
          <div class="i-lucide-settings-2 text-muted-foreground size-3.5" />
          <h3 class="text-sm font-semibold">
            {{ $t('edit.visualEditor.animation.inspectorTitle') }}
          </h3>
          <span v-if="props.selectedFrame" class="text-xs text-muted-foreground">
            {{ $t('edit.visualEditor.animation.summary.currentFrameWithId', { id: props.selectedFrame.id }) }}
          </span>
          <Badge
            variant="secondary"
            class="text-[10px] rounded-sm h-5 transition-opacity"
            :class="props.selectedFrame?.isStartFrame ? 'opacity-100' : 'opacity-0 pointer-events-none'"
            :aria-hidden="!props.selectedFrame?.isStartFrame"
          >
            {{ $t('edit.visualEditor.animation.startFrame') }}
          </Badge>
          <span
            class="text-[11px] text-primary/80 inline-flex gap-1 transition-opacity items-center"
            :class="props.selectedFrame?.isStartFrame ? 'opacity-100' : 'opacity-0 pointer-events-none'"
            :aria-hidden="!props.selectedFrame?.isStartFrame"
          >
            <div class="i-lucide-info size-3.5" />
            {{ $t('edit.visualEditor.animation.firstFrameHint') }}
          </span>
        </div>

        <EffectDraftForm
          class="flex-1 min-h-0"
          :transform="inspectorSelectedFrame.transform"
          :duration="inspectorSelectedFrame.duration"
          :ease="inspectorSelectedFrame.ease"
          :ease-disabled="inspectorSelectedFrame.isEaseDisabled"
          layout="panel"
          id-namespace="animation-inspector"
          @update:transform="emit('update:selected-frame-transform', $event)"
          @update:duration="emit('update:selected-frame-duration', $event)"
          @update:ease="emit('update:selected-frame-ease', $event)"
        />
      </div>
    </div>
  </div>
</template>
