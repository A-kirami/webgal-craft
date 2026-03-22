<script setup lang="ts">
import { basename } from '@tauri-apps/api/path'
import { File, FilePlus2, FileWarning } from 'lucide-vue-next'

import { useVisualEditorSaveShortcut } from '~/composables/useVisualEditorSaveShortcut'
import { isEditableEditor, useEditorStore } from '~/stores/editor'
import { useModalStore } from '~/stores/modal'
import { useTabsStore } from '~/stores/tabs'

const editorStore = useEditorStore()
const tabsStore = useTabsStore()
const modalStore = useModalStore()

async function handleCreateScene() {
  modalStore.open('CreateFileModal', {
    onSuccess: async (filePath: string) => {
      const fileName = await basename(filePath)
      tabsStore.openTab(fileName, filePath, { forceNormal: true, focus: true })
    },
  })
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
useVisualEditorSaveShortcut(() => currentVisualProjection?.path ?? '')
const currentPreviewState = $computed(() => {
  const state = currentState
  return state && !isEditableEditor(state) && state.view === 'preview' ? state : undefined
})
const currentUnsupportedState = $computed(() => {
  const state = currentState
  return state && !isEditableEditor(state) && state.view === 'unsupported' ? state : undefined
})
const hasEditableWorkspace = $computed(() =>
  currentTextProjection !== undefined || currentVisualProjection?.kind === 'scene',
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
        v-show="activeProjection === 'text' || currentVisualProjection?.kind !== 'scene'"
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
          <FilePlus2 class="size-4" />
          {{ $t('edit.empty.createScene') }}
        </Button>
      </EmptyContent>
    </Empty>
    <div v-else-if="shouldShowPlaceholder" class="h-full" />
  </div>
</template>
