<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'

let open = $(defineModel<boolean>('open'))

const { onApply, onDiscard, onCancel } = defineProps<{
  onApply?: () => void | Promise<void>
  onDiscard?: () => void | Promise<void>
  onCancel?: () => void | Promise<void>
}>()

let actionHandled = $ref(false)

async function handleApply() {
  actionHandled = true
  await onApply?.()
  open = false
}

async function handleDiscard() {
  actionHandled = true
  await onDiscard?.()
  open = false
}

async function handleCancel() {
  actionHandled = true
  await onCancel?.()
  open = false
}

watch(() => open, async (nextOpen, previousOpen) => {
  if (nextOpen) {
    actionHandled = false
    return
  }

  if (previousOpen && !actionHandled) {
    actionHandled = true
    await onCancel?.()
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
