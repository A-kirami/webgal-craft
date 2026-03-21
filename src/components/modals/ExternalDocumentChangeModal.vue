<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'

let open = $(defineModel<boolean>('open'))

const {
  path,
  allowMerge,
  onKeepLocal,
  onLoadExternal,
  onMerge,
  onCancel,
} = defineProps<{
  path: string
  allowMerge: boolean
  onKeepLocal?: () => void | Promise<void>
  onLoadExternal?: () => void | Promise<void>
  onMerge?: () => void | Promise<void>
  onCancel?: () => void | Promise<void>
}>()

let actionHandled = $ref(false)

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

async function handleMerge(): Promise<void> {
  await runActionAndClose(onMerge)
}

async function handleCancel(): Promise<void> {
  await runActionAndClose(onCancel)
}

watch(() => open, async (nextOpen, previousOpen) => {
  if (nextOpen) {
    actionHandled = false
    return
  }

  if (previousOpen && !actionHandled) {
    await runAction(onCancel)
  }
})
</script>

<template>
  <AlertDialog ::open="open">
    <AlertDialogContent>
      <div class="flex flex-col gap-2 sm:flex-row sm:gap-4 max-sm:items-center">
        <div
          class="text-yellow-500 rounded-lg bg-yellow/10 flex shrink-0 size-9 items-center justify-center"
          aria-hidden="true"
        >
          <TriangleAlert class="size-5" aria-hidden="true" />
        </div>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{ $t('modals.externalDocumentChange.title') }}
          </AlertDialogTitle>
          <AlertDialogDescription class="break-all">
            {{ $t('modals.externalDocumentChange.description', { path }) }}
          </AlertDialogDescription>
        </AlertDialogHeader>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel @click="handleCancel">
          {{ $t('common.cancel') }}
        </AlertDialogCancel>
        <Button variant="outline" @click="handleKeepLocal">
          {{ $t('modals.externalDocumentChange.keepLocal') }}
        </Button>
        <Button v-if="allowMerge" variant="outline" @click="handleMerge">
          {{ $t('modals.externalDocumentChange.merge') }}
        </Button>
        <AlertDialogAction @click="handleLoadExternal">
          {{ $t('modals.externalDocumentChange.loadExternal') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
