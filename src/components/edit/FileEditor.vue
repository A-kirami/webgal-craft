<script setup lang="ts">
import { basename } from '@tauri-apps/api/path'
import { File, FilePlus2, FileWarning } from 'lucide-vue-next'

const editorStore = useEditorStore()
const tabsStore = useTabsStore()
const modalStore = useModalStore()
const effectEditorProvider = useEffectEditorProvider()
const fileEditorContainerRef = $(useTemplateRef('fileEditorContainerRef'))
const effectEditorSession = $computed(() => effectEditorProvider.session)

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

const shouldShowEmpty = $computed(() => {
  return hasDelayPassed && tabsStore.tabs.length === 0 && !editorStore.currentState
})

function focusTextEditorAfterEffectEditorClose() {
  if (editorStore.currentState?.mode === 'text') {
    tabsStore.shouldFocusEditor = true
  }
}

async function closeEffectEditor() {
  const closed = await effectEditorProvider.close()
  if (closed) {
    focusTextEditorAfterEffectEditorClose()
  }
}

async function handleEffectEditorSheetOpenChange(nextOpen: boolean) {
  if (nextOpen) {
    return
  }

  await closeEffectEditor()
}

function handleEffectTransformUpdate(payload: { value: Transform, deferAutoApply?: boolean }) {
  effectEditorProvider.updateDraft(
    { transform: payload.value },
    { deferAutoApply: payload.deferAutoApply },
  )
}

async function handleEffectApply() {
  if (!effectEditorProvider.canApply) {
    return
  }

  const applied = await effectEditorProvider.apply()
  if (applied) {
    focusTextEditorAfterEffectEditorClose()
  }
}

function handleEffectReset() {
  if (!effectEditorProvider.canReset) {
    return
  }

  effectEditorProvider.resetToInitialDraft()
}
</script>

<template>
  <div ref="fileEditorContainerRef" class="h-full relative overflow-hidden">
    <KeepAlive>
      <TextEditor v-if="editorStore.currentState?.mode === 'text'" ::state="editorStore.currentState" />
      <VisualEditor v-else-if="editorStore.currentState?.mode === 'visual'" ::state="editorStore.currentState" />
      <AssetPreview v-else-if="editorStore.currentState?.mode === 'preview'" ::state="editorStore.currentState" />
      <Empty
        v-else-if="editorStore.currentState?.mode === 'unsupported'"
        class="border-0 h-full"
      >
        <EmptyContent>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileWarning />
            </EmptyMedia>
            <EmptyDescription>
              {{ editorStore.currentState.reason }}
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

    <Sheet :open="effectEditorProvider.isOpen" :modal="false" @update:open="handleEffectEditorSheetOpenChange">
      <div
        v-if="effectEditorProvider.isOpen"
        class="inset-x-0 bottom-0 top-7 fixed z-40"
        aria-hidden="true"
        @click="closeEffectEditor"
      />
      <SheetContent
        :to="fileEditorContainerRef ?? undefined"
        :overlay="false"
        side="right"
        class="p-4 max-w-none w-100 inset-y-0 right-0 absolute sm:max-w-none"
        @open-auto-focus.prevent
        @close-auto-focus.prevent
        @pointer-down-outside.prevent
        @interact-outside.prevent
      >
        <div class="flex flex-col h-full">
          <SheetHeader class="pr-8 gap-y-0.5">
            <SheetTitle class="text-base">
              {{ $t('modals.effectEditor.title') }}
            </SheetTitle>
            <SheetDescription class="text-13px!">
              {{ $t('modals.effectEditor.description') }}
            </SheetDescription>
          </SheetHeader>
          <Separator class="mb-4 mt-2" />
          <EffectEditorPanel
            v-if="effectEditorSession"
            class="flex-1 min-h-0"
            :transform="effectEditorSession.draft.transform"
            :duration="effectEditorSession.draft.duration"
            :ease="effectEditorSession.draft.ease"
            :can-apply="effectEditorProvider.canApply"
            :can-reset="effectEditorProvider.canReset"
            @update:transform="handleEffectTransformUpdate"
            @update:duration="effectEditorProvider.updateDraft({ duration: $event })"
            @update:ease="effectEditorProvider.updateDraft({ ease: $event })"
            @preview="effectEditorProvider.requestPreview"
            @apply="handleEffectApply"
            @reset="handleEffectReset"
          />
        </div>
      </SheetContent>
    </Sheet>
  </div>
</template>
