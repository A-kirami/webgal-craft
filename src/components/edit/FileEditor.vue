<script setup lang="ts">
import { basename } from '@tauri-apps/api/path'
import { File, FilePlus2, FileWarning } from 'lucide-vue-next'

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

const shouldShowEmpty = $computed(() => {
  return hasDelayPassed && tabsStore.tabs.length === 0 && !currentState
})
</script>

<template>
  <div class="h-full overflow-hidden">
    <KeepAlive>
      <TextEditor
        v-if="currentState && isEditableEditor(currentState) && currentState.projection === 'text'"
        :state="currentState"
      />
      <VisualEditor
        v-else-if="currentState && isEditableEditor(currentState) && currentState.projection === 'visual'"
        :state="currentState"
      />
      <AssetPreview
        v-else-if="currentState && !isEditableEditor(currentState) && currentState.view === 'preview'"
        :state="currentState"
      />
      <Empty
        v-else-if="currentState && !isEditableEditor(currentState) && currentState.view === 'unsupported'"
        class="border-0 h-full"
      >
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
      <div v-else class="h-full" />
    </KeepAlive>
  </div>
</template>
