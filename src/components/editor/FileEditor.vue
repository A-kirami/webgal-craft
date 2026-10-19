<script setup lang="ts">
import { Code, File, FilePlus2, FileWarning } from '@lucide/vue'

import { AbsPath } from '~/domain/path'
import { isEditableEditor, useEditorStore } from '~/stores/editor'
import { useModalStore } from '~/stores/modal'
import { useTabsStore } from '~/stores/tabs'

const editorStore = useEditorStore()
const tabsStore = useTabsStore()
const modalStore = useModalStore()

async function handleCreateScene() {
  modalStore.open('CreateFileModal', {
    onSuccess(filePath: string) {
      const fileName = AbsPath.basename(AbsPath.from(filePath))
      tabsStore.openTab(fileName, AbsPath.from(filePath), { forceNormal: true, focus: true })
    },
  })
}

function handleSwitchToTextMode() {
  editorStore.switchEditorMode('text')
}

// 防止在标签页从持久化存储还原期间显示空状态造成闪烁
const ANTI_FLICKER_DELAY = 100
const hasDelayPassed = $(useTimeout(ANTI_FLICKER_DELAY))
const currentState = $computed(() => editorStore.currentState)
const currentTextProjection = $computed(() => editorStore.currentTextProjection)
const currentVisualProjection = $computed(() => editorStore.currentVisualProjection)
const activeProjection = $computed(() =>
  currentState && isEditableEditor(currentState)
    ? currentState.projection
    : undefined,
)
const currentPreviewState = $computed(() => {
  const state = currentState
  return state && !isEditableEditor(state) && state.view === 'preview' ? state : undefined
})
const currentUnsupportedState = $computed(() => {
  const state = currentState
  return state && !isEditableEditor(state) && state.view === 'unsupported' ? state : undefined
})
const currentAnimationFramesProjection = $computed(() =>
  currentVisualProjection?.kind === 'animation' && currentVisualProjection.format === 'v1-frames'
    ? currentVisualProjection
    : undefined,
)
const animationVisualError = $computed(() => {
  if (activeProjection !== 'visual' || currentVisualProjection?.kind !== 'animation') {
    return
  }

  if (currentTextProjection?.syncError === 'invalid-animation-json') {
    return 'invalid' as const
  }

  if (currentVisualProjection.format === 'v2-object') {
    return 'v2' as const
  }
})
const hasEditableWorkspace = $computed(() =>
  currentTextProjection !== undefined || currentVisualProjection !== undefined,
)

const shouldShowEmpty = $computed(() => {
  return hasDelayPassed && tabsStore.tabs.length === 0 && !currentState
})

const shouldShowPlaceholder = $computed(() =>
  !hasEditableWorkspace
  && currentPreviewState === undefined
  && currentUnsupportedState === undefined
  && !shouldShowEmpty,
)
</script>

<template>
  <div class="h-full overflow-hidden">
    <KeepAlive>
      <TextEditor
        v-if="currentTextProjection"
        v-show="activeProjection === 'text'"
        :state="currentTextProjection"
      />
    </KeepAlive>
    <KeepAlive>
      <VisualEditorScene
        v-if="currentVisualProjection?.kind === 'scene'"
        v-show="activeProjection === 'visual'"
        :state="currentVisualProjection"
      />
    </KeepAlive>
    <KeepAlive>
      <VisualEditorAnimation
        v-if="currentAnimationFramesProjection && !animationVisualError"
        v-show="activeProjection === 'visual'"
        :state="currentAnimationFramesProjection"
      />
    </KeepAlive>
    <Empty v-if="animationVisualError" class="border-0 h-full">
      <EmptyContent>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileWarning />
          </EmptyMedia>
          <EmptyDescription>
            {{
              animationVisualError === 'invalid'
                ? $t('edit.textEditor.invalidAnimationVisualMessage')
                : $t('edit.textEditor.animationV2ReadOnlyMessage')
            }}
          </EmptyDescription>
        </EmptyHeader>
        <Button @click="handleSwitchToTextMode">
          <Code />
          {{ $t('edit.editorMode.switchToText') }}
        </Button>
      </EmptyContent>
    </Empty>
    <AssetPreview v-if="currentPreviewState" :state="currentPreviewState" />
    <Empty v-else-if="currentUnsupportedState" class="border-0 h-full">
      <EmptyContent>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileWarning />
          </EmptyMedia>
          <EmptyDescription>
            {{ $t('edit.unsupported.unsupportedFile') }}
          </EmptyDescription>
        </EmptyHeader>
      </EmptyContent>
    </Empty>
    <Empty v-else-if="shouldShowEmpty" class="border-0 h-full">
      <EmptyContent>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <File />
          </EmptyMedia>
          <EmptyTitle>{{ $t('edit.empty.title') }}</EmptyTitle>
          <EmptyDescription>
            {{ $t('edit.empty.description') }}
          </EmptyDescription>
        </EmptyHeader>
        <Button @click="handleCreateScene">
          <FilePlus2 />
          {{ $t('edit.empty.createScene') }}
        </Button>
      </EmptyContent>
    </Empty>
    <div v-else-if="shouldShowPlaceholder" class="h-full" />
  </div>
</template>
