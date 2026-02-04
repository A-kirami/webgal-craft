<script setup lang="ts">
import { basename } from '@tauri-apps/api/path'
import { File, FilePlus2 } from 'lucide-vue-next'

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
</script>

<template>
  <KeepAlive>
    <TextEditor v-if="editorStore.currentState?.mode === 'text'" v-model:state="editorStore.currentState" />
    <VisualEditor v-else-if="editorStore.currentState?.mode === 'visual'" v-model:state="editorStore.currentState" />
    <AssetPreview v-else-if="editorStore.currentState?.mode === 'preview'" v-model:state="editorStore.currentState" />
    <Empty v-else-if="tabsStore.tabs.length === 0" class="border-0 h-full">
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
  </KeepAlive>
</template>
