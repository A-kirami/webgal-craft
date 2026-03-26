<script setup lang="ts">
import { usePointerDrag } from '~/composables/usePointerDrag'
import { resolveI18n } from '~/features/editor/command-registry/schema'
import { DEFAULT_EASE_OPTION_VALUE, EFFECT_EASE_OPTIONS } from '~/features/editor/effect-editor/effect-editor-config'
import { clamp } from '~/utils/math'

import {
  MIN_SPAN_PX,
  MIN_START_SPAN_PX,
  resolveAnimationTimelineAnchoredScrollLeft,
  resolveAnimationTimelineContainerWidth,
  resolveZeroDurationSpanLayoutPercents,
} from './animation-timeline-layout'

import type { ScrollArea } from '~/components/ui/scroll-area'
import type { AnimationTimelineResizeDurationPayload } from '~/features/editor/animation/animation-editor-contract'
import type { AnimationEditorKeyframe } from '~/features/editor/animation/animation-inspector'

interface Props {
  keyframes: readonly AnimationEditorKeyframe[]
  selectedId: number
  totalDuration: number
}

interface SpanLayout {
  left: number
  span: TimelineSpan
  width: number
}

interface TimelineSpan {
  duration: number
  ease?: string
  end: number
  id: number
  isHold: boolean
  start: number
}

const props = defineProps<Props>()
const { t } = useI18n()

const emit = defineEmits<{
  resizeDuration: [payload: AnimationTimelineResizeDurationPayload]
  select: [id: number]
  zoomChange: [zoomPercent: number]
}>()

const MIN_EASE_LABEL_PX = 80
const MAX_ZOOM = 5
const MIN_ZOOM = 1
const ZOOM_SENSITIVITY = 0.002

const scrollAreaRef = $ref<InstanceType<typeof ScrollArea>>()
const viewportSize = useElementSize(() => scrollAreaRef?.viewport?.viewportElement)
const viewportWidth = $computed(() => viewportSize.width.value)

let zoomLevel = $ref(1)
const isEmptyTimeline = $computed(() => props.keyframes.length === 0)

const easeLabelMap = $computed(() => {
  return new Map(
    EFFECT_EASE_OPTIONS
      .filter(option => option.value !== DEFAULT_EASE_OPTION_VALUE)
      .map(option => [option.value, resolveI18n(option.label, t)]),
  )
})

watch(
  () => Math.round(zoomLevel * 100),
  (zoomPercent) => {
    emit('zoomChange', zoomPercent)
  },
  { immediate: true },
)

const spans = $computed(() => {
  const result: TimelineSpan[] = []
  const first = props.keyframes[0]
  if (!first) {
    return result
  }

  result.push({
    duration: first.duration,
    ease: '',
    end: first.cumulativeTime,
    id: first.id,
    isHold: true,
    start: 0,
  })

  for (let index = 1; index < props.keyframes.length; index++) {
    const previous = props.keyframes[index - 1]
    const current = props.keyframes[index]
    if (!previous || !current) {
      continue
    }

    result.push({
      duration: current.duration,
      ease: current.ease?.trim() || undefined,
      end: current.cumulativeTime,
      id: current.id,
      isHold: false,
      start: previous.cumulativeTime,
    })
  }

  return result
})

const layout = $computed((): SpanLayout[] => {
  const width = containerWidth
  if (width <= 0 || spans.length === 0) {
    return []
  }

  if (props.totalDuration <= 0) {
    return resolveZeroDurationSpanLayoutPercents(width, spans).map((item, index) => {
      const result = {
        left: item.left,
        span: spans[index]!,
        width: item.width,
      } satisfies SpanLayout
      return result
    })
  }

  const items = spans.map((span) => {
    const minimumWidthPx = span.isHold ? MIN_START_SPAN_PX : MIN_SPAN_PX
    const proportionalWidth = (span.duration / props.totalDuration) * 100
    return {
      minimumWidthPercent: (minimumWidthPx / width) * 100,
      isNarrow: proportionalWidth < ((minimumWidthPx / width) * 100),
      span,
    }
  })

  const narrowItems = items.filter(item => item.isNarrow)
  const normalItems = items.filter(item => !item.isNarrow)
  const narrowTotalPercent = narrowItems.reduce((sum, item) => sum + item.minimumWidthPercent, 0)
  const remainPercent = Math.max(100 - narrowTotalPercent, 0)
  const normalTotalDuration = normalItems.reduce((sum, item) => sum + item.span.duration, 0)

  let left = 0
  return items.map(({ span, isNarrow, minimumWidthPercent }) => {
    let widthPercent = 0
    if (isNarrow) {
      widthPercent = minimumWidthPercent
    } else if (normalTotalDuration > 0) {
      widthPercent = (span.duration / normalTotalDuration) * remainPercent
    }

    const result = {
      left,
      span,
      width: widthPercent,
    } satisfies SpanLayout
    left += widthPercent
    return result
  })
})

const containerWidth = $computed(() => {
  return resolveAnimationTimelineContainerWidth(viewportWidth, zoomLevel, spans)
})

const rulerStep = $computed(() => {
  if (props.totalDuration <= 1000) {
    return 100
  }
  if (props.totalDuration <= 2000) {
    return 200
  }
  if (props.totalDuration <= 5000) {
    return 500
  }
  return 1000
})

const rulerMarks = $computed(() => {
  if (isEmptyTimeline) {
    return []
  }

  if (props.totalDuration <= 0) {
    return [0]
  }

  const marks: number[] = []
  for (let time = 0; time <= props.totalDuration; time += rulerStep) {
    marks.push(time)
  }

  if (marks.at(-1) !== props.totalDuration) {
    marks.push(props.totalDuration)
  }
  return marks
})

const dedupedEndMarkers = $computed(() => {
  const seen = new Map<number, SpanLayout>()
  for (const item of layout) {
    seen.set(item.span.end, item)
  }
  return [...seen.values()]
})

interface ResizeDragState {
  id: number
  lastDuration: number
  msPerPixel: number
  startClientX: number
  startDuration: number
}

const pendingResizePayload = shallowRef<AnimationTimelineResizeDurationPayload>()
let pendingResizeFrameId = $ref<number>()

const resizeDrag = usePointerDrag<ResizeDragState>({
  onStart(event) {
    const handle = event.currentTarget as HTMLElement | null
    const spanId = Number(handle?.dataset.spanId)
    if (!Number.isInteger(spanId) || (event.pointerType === 'mouse' && event.button !== 0)) {
      return
    }

    const spanLayout = layout.find(item => item.span.id === spanId)
    if (!spanLayout) {
      return
    }

    const frameWidthPx = Math.max((spanLayout.width / 100) * containerWidth, 1)
    const referenceDuration = spanLayout.span.duration > 0
      ? spanLayout.span.duration
      : Math.max(Math.round(frameWidthPx), 1)

    emit('select', spanId)
    return {
      id: spanId,
      lastDuration: spanLayout.span.duration,
      msPerPixel: referenceDuration / frameWidthPx,
      startClientX: event.clientX,
      startDuration: spanLayout.span.duration,
    }
  },
  onMove(event, state) {
    const deltaX = event.clientX - state.startClientX
    const nextDuration = Math.max(0, Math.round(state.startDuration + (deltaX * state.msPerPixel)))
    if (nextDuration === state.lastDuration) {
      return
    }

    state.lastDuration = nextDuration
    scheduleResizeDurationEmit({
      duration: nextDuration,
      flush: false,
      id: state.id,
    })
  },
  onEnd(_event, state) {
    flushPendingResizeDurationEmit()
    emit('resizeDuration', {
      duration: Math.max(0, Math.round(state.lastDuration)),
      flush: true,
      id: state.id,
    })
  },
})

function scheduleResizeDurationEmit(payload: AnimationTimelineResizeDurationPayload): void {
  pendingResizePayload.value = payload
  if (pendingResizeFrameId !== undefined) {
    return
  }

  pendingResizeFrameId = requestAnimationFrame(() => {
    pendingResizeFrameId = undefined
    if (!pendingResizePayload.value) {
      return
    }

    emit('resizeDuration', pendingResizePayload.value)
    pendingResizePayload.value = undefined
  })
}

function flushPendingResizeDurationEmit(): void {
  if (pendingResizeFrameId !== undefined) {
    cancelAnimationFrame(pendingResizeFrameId)
    pendingResizeFrameId = undefined
  }

  if (!pendingResizePayload.value) {
    return
  }

  emit('resizeDuration', pendingResizePayload.value)
  pendingResizePayload.value = undefined
}

function handleResizePointerDown(event: PointerEvent): void {
  event.preventDefault()
  event.stopPropagation()
  resizeDrag.start(event)
}

function getDistortedPercent(time: number): string {
  return `${getDistortedPosition(time)}%`
}

function getDistortedPosition(time: number): number {
  if (props.totalDuration <= 0 || layout.length === 0) {
    return 0
  }

  for (const item of layout) {
    const { span, left, width } = item
    if (time <= span.end || item === layout.at(-1)) {
      if (span.duration === 0) {
        return left + (width / 2)
      }

      const ratio = clamp((time - span.start) / span.duration, 0, 1)
      return left + (ratio * width)
    }
  }

  return 100
}

function getEndMarkerClass(index: number, total: number): string {
  if (index === total - 1) {
    return '-translate-x-full items-end text-right'
  }
  return '-translate-x-1/2 items-center'
}

function handleWheel(event: WheelEvent) {
  event.preventDefault()
  const viewport = scrollAreaRef?.viewport?.viewportElement as HTMLElement | undefined
  if (!viewport) {
    return
  }

  if (event.ctrlKey || event.metaKey) {
    const previousZoom = zoomLevel
    const delta = -event.deltaY * ZOOM_SENSITIVITY
    const nextZoom = clamp(previousZoom * (1 + delta), MIN_ZOOM, MAX_ZOOM)
    if (nextZoom === previousZoom) {
      return
    }

    const viewportRect = viewport.getBoundingClientRect()
    const cursorX = clamp(event.clientX - viewportRect.left, 0, viewport.clientWidth)
    const contentPosition = viewport.scrollLeft + cursorX
    const nextScrollLeft = resolveAnimationTimelineAnchoredScrollLeft({
      contentPosition,
      cursorX,
      nextZoom,
      previousZoom,
      spans,
      viewportWidth: viewport.clientWidth,
    })

    zoomLevel = nextZoom
    nextTick(() => {
      viewport.scrollLeft = nextScrollLeft
    })
    return
  }

  viewport.scrollLeft += event.deltaY
}

function isSpanWideEnough(widthPercent: number): boolean {
  return ((widthPercent / 100) * containerWidth) >= MIN_EASE_LABEL_PX
}

function getEaseLabel(value: string): string {
  return easeLabelMap.get(value) ?? value
}

onUnmounted(() => {
  resizeDrag.stop()
  if (pendingResizeFrameId !== undefined) {
    cancelAnimationFrame(pendingResizeFrameId)
    pendingResizeFrameId = undefined
  }
  pendingResizePayload.value = undefined
})
</script>

<template>
  <div class="h-full min-h-0 relative">
    <ScrollArea
      ref="scrollAreaRef"
      class="border rounded-lg bg-muted/20 h-27 relative"
      @wheel="handleWheel"
    >
      <div
        v-if="isEmptyTimeline"
        class="text-muted-foreground px-4 text-center flex flex-col gap-1 pointer-events-none items-center inset-0 justify-center absolute z-10"
      >
        <span class="text-xs font-medium">
          {{ $t('edit.visualEditor.animation.emptyTitle') }}
        </span>
        <span class="text-[11px]">
          {{ $t('edit.visualEditor.animation.emptyDescription') }}
        </span>
      </div>

      <div
        class="h-full relative"
        :style="{ width: `${containerWidth}px` }"
      >
        <div
          v-for="mark in rulerMarks"
          :key="`ruler-${mark}`"
          class="inset-y-0 absolute"
          :style="{ left: getDistortedPercent(mark) }"
        >
          <div class="bg-border/80 h-full w-px" />
          <span class="text-[10px] text-muted-foreground font-mono left-1 top-0.5 absolute">
            {{ mark }}{{ $t('edit.visualEditor.animation.unitMs') }}
          </span>
        </div>

        <template
          v-for="item in layout"
          :key="`span-${item.span.id}`"
        >
          <button
            type="button"
            class="px-2 text-left border rounded-md h-10 transition-colors top-9 absolute overflow-hidden"
            :class="item.span.id === props.selectedId
              ? 'bg-primary/12 border-primary/70 hover:bg-primary/20'
              : item.span.isHold
                ? 'border-border border-dashed hover:border-primary/45'
                : 'bg-background/80 border-border hover:bg-accent/65 hover:border-primary/45'"
            :style="{ left: `${item.left}%`, width: `${item.width}%` }"
            @click="emit('select', item.span.id)"
          >
            <span class="text-xs text-foreground leading-3 left-1 top-0.5 absolute">
              #{{ item.span.id }}
            </span>
            <span
              v-if="item.span.isHold"
              class="text-[10px] text-muted-foreground leading-3 left-6 top-0.5 absolute"
            >
              {{ $t('edit.visualEditor.animation.startFrame') }}
            </span>
            <span
              v-if="!item.span.isHold && item.span.ease && isSpanWideEnough(item.width)"
              class="text-[11px] text-muted-foreground leading-3 max-w-[58%] truncate right-1 top-0.5 absolute"
            >
              {{ getEaseLabel(item.span.ease) }}
            </span>
            <span class="text-[11px] text-muted-foreground leading-3 bottom-0.5 left-1 absolute">
              {{ item.span.duration }}{{ $t('edit.visualEditor.animation.unitMs') }}
            </span>
          </button>

          <div
            :data-span-id="item.span.id"
            class="h-10 w-3 cursor-ew-resize top-9 absolute z-10 -translate-x-1/2"
            :style="{ left: `${item.left + item.width}%` }"
            @pointerdown="handleResizePointerDown"
          />
        </template>

        <div
          v-for="(item, index) in dedupedEndMarkers"
          :key="`time-end-${item.span.id}`"
          class="flex flex-col pointer-events-none bottom-0.5 absolute"
          :class="getEndMarkerClass(index, dedupedEndMarkers.length)"
          :style="{ left: `${item.left + item.width}%` }"
        >
          <div class="border-x-[4px] border-b-[6px] border-x-transparent border-b-muted-foreground/70 h-0 w-0" />
          <span class="text-[10px] text-muted-foreground font-mono mt-0.5 tabular-nums">
            {{ item.span.end }}{{ $t('edit.visualEditor.animation.unitMs') }}
          </span>
        </div>
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  </div>
</template>
