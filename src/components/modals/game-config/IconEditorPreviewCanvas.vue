<script setup lang="ts">
import {
  createIconRenderScratch,
  renderIconPreviewCanvas,
} from '~/features/modals/game-config/icon-editor/icon-editor-render'

import type { IconPreviewKind } from '~/features/modals/game-config/icon-editor/icon-editor-render'
import type { IconEditorState } from '~/features/modals/game-config/icon-editor/icon-editor-state'

interface Props {
  kind: IconPreviewKind
  label: string
  state: IconEditorState
  /** 每次改动递增：既用于触发重绘，也用于复用同一次改动各变体共有的组合结果 */
  version?: number
}

const props = defineProps<Props>()

/** 预览画布的显示边长；组合画布按 2 倍取，兼顾高分屏且不按导出分辨率重算 */
const PREVIEW_CANVAS_SIZE = 192
const PREVIEW_SOURCE_SIZE = PREVIEW_CANVAS_SIZE * 2

// 本预览复用自己那套中间画布：拖拽中每次重绘都新建画布 + 取上下文是主要开销
const scratch = createIconRenderScratch()

const canvas = $(useTemplateRef<HTMLCanvasElement>('canvas'))
let scheduledFrameId: number | undefined

function drawPreview() {
  if (!canvas) {
    return
  }

  const source = renderIconPreviewCanvas(props.state, {
    kind: props.kind,
    revision: props.version ?? 0,
    size: PREVIEW_CANVAS_SIZE,
    sourceSize: PREVIEW_SOURCE_SIZE,
    scratch,
  })
  const context = canvas.getContext('2d')
  context?.clearRect(0, 0, canvas.width, canvas.height)
  context?.drawImage(source, 0, 0, canvas.width, canvas.height)
}

function scheduleDraw() {
  if (scheduledFrameId !== undefined) {
    return
  }

  scheduledFrameId = requestAnimationFrame(() => {
    scheduledFrameId = undefined
    drawPreview()
  })
}

onMounted(scheduleDraw)
onBeforeUnmount(() => {
  if (scheduledFrameId === undefined) {
    return
  }

  cancelAnimationFrame(scheduledFrameId)
  scheduledFrameId = undefined
})

watch(
  [() => props.state, () => props.version],
  scheduleDraw,
  { deep: true },
)
</script>

<template>
  <canvas
    ref="canvas"
    :width="PREVIEW_CANVAS_SIZE"
    :height="PREVIEW_CANVAS_SIZE"
    role="img"
    :aria-label="props.label"
  />
</template>
