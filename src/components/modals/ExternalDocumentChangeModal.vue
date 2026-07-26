<script setup lang="ts">
import { GitCompareArrows, TriangleAlert } from '@lucide/vue'

import ExternalDocumentDiffEditor from '~/components/editor/ExternalDocumentDiffEditor.vue'

import type { DocumentKind } from '~/domain/document/document-model'

let open = $(defineModel<boolean>('open'))

const {
  path,
  documentKind,
  allowMerge,
  localContent,
  externalContent,
  onKeepLocal,
  onLoadExternal,
  onMerge,
  onCancel,
} = defineProps<{
  path: string
  documentKind: DocumentKind
  allowMerge: boolean
  localContent: string
  externalContent: string
  onKeepLocal?: () => void | Promise<void>
  onLoadExternal?: () => void | Promise<void>
  onMerge?: (content: string) => void | Promise<void>
  onCancel?: () => void | Promise<void>
}>()

let actionHandled = $ref(false)
let view = $ref<'decision' | 'merge'>('decision')

type ModalAction = (() => void | Promise<void>) | undefined

async function runAction(action: ModalAction): Promise<void> {
  actionHandled = true
  await action?.()
}

async function runActionAndClose(action: ModalAction): Promise<void> {
  await runAction(action)
  open = false
}

async function handleKeepLocal(): Promise<void> {
  await runActionAndClose(onKeepLocal)
}

async function handleLoadExternal(): Promise<void> {
  await runActionAndClose(onLoadExternal)
}

function handleReviewMerge(): void {
  view = 'merge'
}

async function handleApplyMerge(content: string): Promise<void> {
  await runActionAndClose(() => onMerge?.(content))
}

async function handleCancel(): Promise<void> {
  await runActionAndClose(onCancel)
}

watch(() => open, async (nextOpen, previousOpen) => {
  if (nextOpen) {
    actionHandled = false
    view = 'decision'
    return
  }

  if (previousOpen && !actionHandled) {
    await runAction(onCancel)
  }
})
</script>

<template>
  <AlertDialog ::open="open">
    <AlertDialogContent
      :class="view === 'merge' && 'h-[min(84vh,860px)] max-w-[min(94vw,1500px)] grid-rows-[auto_minmax(0,1fr)]'"
    >
      <div class="flex flex-col gap-2 sm:flex-row sm:gap-4 max-sm:items-center">
        <div
          :class="[
            'rounded-lg flex shrink-0 size-9 items-center justify-center',
            view === 'decision' ? 'text-yellow-500 bg-yellow/10' : 'text-primary bg-primary/10',
          ]"
          aria-hidden="true"
        >
          <TriangleAlert v-if="view === 'decision'" class="size-5" aria-hidden="true" />
          <GitCompareArrows v-else class="size-5" aria-hidden="true" />
        </div>
        <AlertDialogHeader>
          <AlertDialogTitle v-if="view === 'decision'">
            {{ $t('modals.externalDocumentChange.title') }}
          </AlertDialogTitle>
          <AlertDialogTitle v-else>
            {{ $t('modals.externalDocumentChange.diff.title') }}
          </AlertDialogTitle>
          <AlertDialogDescription v-if="view === 'decision'" class="break-all">
            {{ $t('modals.externalDocumentChange.description', { path }) }}
          </AlertDialogDescription>
          <AlertDialogDescription v-else class="break-all">
            {{ $t('modals.externalDocumentChange.diff.description', { path }) }}
          </AlertDialogDescription>
        </AlertDialogHeader>
      </div>

      <ExternalDocumentDiffEditor
        v-if="view === 'merge'"
        :path="path"
        :kind="documentKind"
        :local-content="localContent"
        :external-content="externalContent"
        @apply="handleApplyMerge"
        @back="view = 'decision'"
      />

      <AlertDialogFooter v-else>
        <AlertDialogCancel @click="handleCancel">
          {{ $t('common.cancel') }}
        </AlertDialogCancel>
        <Button variant="outline" @click="handleKeepLocal">
          {{ $t('modals.externalDocumentChange.keepLocal') }}
        </Button>
        <Button v-if="allowMerge" variant="outline" @click="handleReviewMerge">
          {{ $t('modals.externalDocumentChange.reviewAndMerge') }}
        </Button>
        <AlertDialogAction @click="handleLoadExternal">
          {{ $t('modals.externalDocumentChange.loadExternal') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
