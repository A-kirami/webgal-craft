<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'

let open = $(defineModel<boolean>('open'))

const { onSave, onDontSave } = defineProps<{
  title: string
  description?: string
  saveLabel?: string
  dontSaveLabel?: string
  onSave?: () => void | Promise<void>
  onDontSave?: () => void | Promise<void>
}>()

async function handleSave() {
  await onSave?.()
  open = false
}

async function handleDontSave() {
  await onDontSave?.()
  open = false
}
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
            {{ title }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {{ description ?? $t('modals.saveChanges.description') }}
          </AlertDialogDescription>
        </AlertDialogHeader>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>
          {{ $t('common.cancel') }}
        </AlertDialogCancel>
        <Button variant="outline" @click="handleDontSave">
          {{ dontSaveLabel ?? $t('modals.saveChanges.dontSave') }}
        </Button>
        <AlertDialogAction @click="handleSave">
          {{ saveLabel ?? $t('modals.saveChanges.save') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
