<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'

let open = $(defineModel<boolean>('open'))

const { onApply, onDiscard, onCancel } = defineProps<{
  onApply?: () => void | Promise<void>
  onDiscard?: () => void | Promise<void>
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

async function handleApply(): Promise<void> {
  await runActionAndClose(onApply)
}

async function handleDiscard(): Promise<void> {
  await runActionAndClose(onDiscard)
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
            {{ $t('modals.discardEffectChanges.title') }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {{ $t('modals.discardEffectChanges.description') }}
          </AlertDialogDescription>
        </AlertDialogHeader>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel @click="handleCancel">
          {{ $t('common.cancel') }}
        </AlertDialogCancel>
        <Button variant="outline" @click="handleDiscard">
          {{ $t('modals.discardEffectChanges.discard') }}
        </Button>
        <AlertDialogAction @click="handleApply">
          {{ $t('modals.discardEffectChanges.apply') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
