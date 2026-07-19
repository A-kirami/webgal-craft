<script setup lang="ts">
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'

import type { Transform } from '~/domain/stage/types'
import type {
  EffectEditorPreviewPayload,
  EffectEditorTransformUpdatePayload,
} from '~/features/editor/effect-editor/useEffectEditorProvider'
import type { TransformBaselineSource } from '~/features/editor/transform-resolution/model'

interface EffectEditorPanelProps {
  transform: Transform
  baselineSource?: TransformBaselineSource
  baselineTransform?: Transform
  previewFieldValue?: (path: string) => string | undefined
  duration: string
  ease: string
  canApply: boolean
  canClear: boolean
  showFooter?: boolean
  inline?: boolean
}

const props = withDefaults(defineProps<EffectEditorPanelProps>(), {
  showFooter: true,
})
const panelRef = useTemplateRef<HTMLElement>('panelRef')

const emit = defineEmits<{
  'update:transform': [payload: EffectEditorTransformUpdatePayload]
  'update:duration': [value: string]
  'update:ease': [value: string]
  'preview': [payload: EffectEditorPreviewPayload]
  'cancel-preview': []
  'apply': []
  'clear': []
}>()

useShortcutContext({
  panelFocus: 'effectEditor',
}, {
  target: panelRef,
  trackFocus: true,
})

onMounted(() => {
  panelRef.value?.focus({ preventScroll: true })
})

async function handleClear(): Promise<void> {
  emit('clear')
  await nextTick()
  panelRef.value?.focus({ preventScroll: true })
}
</script>

<template>
  <div ref="panelRef" tabindex="-1" class="outline-none flex flex-col h-full min-h-0">
    <EffectDraftForm
      class="flex-1 min-h-0"
      :transform="props.transform"
      :baseline-source="props.baselineSource"
      :baseline-transform="props.baselineTransform"
      :preview-field-value="props.previewFieldValue"
      :duration="props.duration"
      :ease="props.ease"
      :inline="props.inline"
      id-namespace="effect-editor"
      @update:transform="emit('update:transform', $event)"
      @update:duration="emit('update:duration', $event)"
      @update:ease="emit('update:ease', $event)"
      @preview="emit('preview', $event)"
      @cancel-preview="emit('cancel-preview')"
    />

    <div v-if="props.showFooter" class="mt-4 flex gap-2 justify-end">
      <Button variant="outline" class="text-xs px-3 h-7 shadow-none" :disabled="!props.canClear" @click="handleClear">
        {{ $t('modals.effectEditor.clear') }}
      </Button>
      <Button class="text-xs px-3 h-7" :disabled="!props.canApply" @click="emit('apply')">
        {{ $t('modals.effectEditor.apply') }}
      </Button>
    </div>
  </div>
</template>
