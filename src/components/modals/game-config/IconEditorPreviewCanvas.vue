<script setup lang="ts">
import { renderIconCanvas } from '~/features/modals/game-config/icon-editor/icon-editor-render'

import type { IconPreviewKind } from '~/features/modals/game-config/icon-editor/icon-editor-render'
import type { IconEditorState } from '~/features/modals/game-config/icon-editor/icon-editor-state'

interface Props {
  kind: IconPreviewKind
  label: string
  state: IconEditorState
}

const props = defineProps<Props>()

const canvas = $(useTemplateRef<HTMLCanvasElement>('canvas'))
let scheduledFrameId: number | undefined

function drawPreview() {
  if (!canvas) {
    return
  }

  const source = renderIconCanvas(props.state, {
    kind: props.kind,
    size: 192,
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
  () => props.state,
  scheduleDraw,
  { deep: true },
)
</script>

<template>
  <canvas
    ref="canvas"
    width="192"
    height="192"
    role="img"
    :aria-label="props.label"
  />
</template>
