<script setup lang="ts">
import type {
  ParamRendererCommitSliderPayload,
  ParamRendererLabelPointerPayload,
  ParamRendererSelectPayload,
  ParamRendererValuePayload,
  StatementParamRendererSharedProps,
  StatementSpecialContentBindings,
  StatementSpecialContentMode,
} from './types'
import type { EditorField } from '~/helper/command-registry/schema'

interface Props {
  surface: 'panel' | 'inline'
  statementType: string
  basicRenderFields: EditorField[]
  specialContentMode?: StatementSpecialContentMode
  showAnimationEditorButton: boolean
  showEffectEditorButton: boolean
  effectEditorAtTop: boolean
  specialContent: StatementSpecialContentBindings
  sceneRootPath: string
  paramRendererSharedProps: StatementParamRendererSharedProps
  customOptionLabel: string
  onUpdateValue: (payload: ParamRendererValuePayload) => void
  onUpdateSelect: (payload: ParamRendererSelectPayload) => void
  onLabelPointerDown: (payload: ParamRendererLabelPointerPayload) => void
  onCommitSlider?: (payload: ParamRendererCommitSliderPayload) => void
}

const props = withDefaults(defineProps<Props>(), {
  onCommitSlider: undefined,
  specialContentMode: undefined,
})

const emit = defineEmits<{
  openAnimationEditor: []
  openEffectEditor: []
}>()

const containerClass = $computed(() => {
  return props.surface === 'panel'
    ? 'flex flex-wrap gap-x-4 gap-y-2.5'
    : 'flex flex-wrap gap-x-3 gap-y-1.5 items-center'
})

const buttonClass = $computed(() => {
  return props.surface === 'panel'
    ? 'px-3 h-7 w-full justify-center'
    : 'px-2 h-6'
})

const paramRendererMode = $computed(() => {
  if (props.statementType === 'say') {
    return props.surface === 'inline' ? 'all' : 'basic'
  }
  return 'basic'
})

const isCommand = $computed(() => props.statementType === 'command')
const hasBasicFields = $computed(() => props.basicRenderFields.length > 0)
const showSpecialContentEditor = $computed(() => isCommand && !!props.specialContentMode)

function handleOpenAnimationEditor() {
  emit('openAnimationEditor')
}

function handleOpenEffectEditor() {
  emit('openEffectEditor')
}
</script>

<template>
  <div :class="containerClass">
    <Button
      v-if="isCommand && props.showAnimationEditorButton"
      variant="outline"
      size="sm"
      class="btn-animation-editor"
      :class="buttonClass"
      @click="handleOpenAnimationEditor"
    >
      <div class="i-lucide-clapperboard size-3" />
      {{ $t('edit.visualEditor.animation.title') }}
    </Button>
    <Button
      v-if="isCommand && props.effectEditorAtTop && props.showEffectEditorButton"
      variant="outline"
      size="sm"
      class="btn-effect-editor"
      :class="buttonClass"
      @click="handleOpenEffectEditor"
    >
      <div class="i-lucide-sparkles size-3" />
      {{ $t('edit.visualEditor.effectEditor') }}
    </Button>
    <StatementSpecialContentEditor
      v-if="showSpecialContentEditor"
      :mode="props.specialContentMode!"
      :surface="props.surface"
      :set-var-content="props.specialContent.setVar.value"
      :choose-items="props.specialContent.choose.value"
      :style-rule-items="props.specialContent.styleRules.value"
      :scene-root-path="props.sceneRootPath"
      @set-var-name="props.specialContent.handleSetVarNameChange"
      @set-var-value="props.specialContent.handleSetVarValueChange"
      @choose-name="props.specialContent.handleChooseNameChange($event.index, $event.value)"
      @choose-file="props.specialContent.handleChooseFileChange($event.index, $event.file)"
      @remove-choose="props.specialContent.handleRemoveChooseItem"
      @add-choose="props.specialContent.handleAddChooseItem"
      @style-old-name="props.specialContent.handleStyleOldNameChange($event.index, $event.value)"
      @style-new-name="props.specialContent.handleStyleNewNameChange($event.index, $event.value)"
      @remove-style-rule="props.specialContent.handleRemoveStyleRule"
      @add-style-rule="props.specialContent.handleAddStyleRule"
    />
    <ParamRenderer
      v-if="hasBasicFields"
      v-bind="props.paramRendererSharedProps"
      :mode="paramRendererMode"
      :fields="props.basicRenderFields"
      :custom-option-label="props.customOptionLabel"
      @update-value="props.onUpdateValue"
      @update-select="props.onUpdateSelect"
      @label-pointer-down="props.onLabelPointerDown"
      @commit-slider="props.onCommitSlider"
    />
    <Button
      v-if="isCommand && props.showEffectEditorButton && !props.effectEditorAtTop"
      variant="outline"
      size="sm"
      class="btn-effect-editor"
      :class="buttonClass"
      @click="handleOpenEffectEditor"
    >
      <div class="i-lucide-sparkles size-3" />
      {{ $t('edit.visualEditor.effectEditor') }}
    </Button>
  </div>
</template>
