<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'

import { gameFs } from '~/services/game-fs'
import { usePreferenceStore } from '~/stores/preference'
import { handleError } from '~/utils/error-handler'

const { t } = useI18n()
let open = $(defineModel<boolean>('open'))

const { file, onConfirm } = defineProps<{
  file: {
    path: string
    name: string
    isDir?: boolean
  }
  onConfirm?: () => void | Promise<void>
}>()

const preferenceStore = usePreferenceStore()
let skipConfirm = $ref(preferenceStore.skipDeleteFileConfirm)

async function handleConfirm() {
  try {
    await gameFs.deleteFile(file.path)
    notify.success(t('edit.fileTree.deleteSuccess'))
    preferenceStore.skipDeleteFileConfirm = skipConfirm
    await onConfirm?.()
    open = false
  } catch (error) {
    handleError(error, { context: t('edit.fileTree.deleteFailed') })
  }
}
</script>

<template>
  <AlertDialog ::open="open">
    <AlertDialogContent>
      <div class="flex flex-col gap-2 sm:flex-row sm:gap-4 max-sm:items-center">
        <div
          class="text-destructive rounded-lg bg-destructive/10 flex shrink-0 size-9 items-center justify-center"
          aria-hidden="true"
        >
          <TriangleAlert class="size-5" aria-hidden="true" />
        </div>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{
              file.isDir
                ? $t('modals.deleteFile.folderTitle', { name: file.name })
                : $t('modals.deleteFile.title', { name: file.name })
            }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            <span>
              {{
                file.isDir
                  ? $t('modals.deleteFile.folderDescription')
                  : $t('modals.deleteFile.description')
              }}
            </span>
            <div class="mt-4 flex items-center space-x-2">
              <Checkbox
                id="skipConfirm"
                ::="skipConfirm"
                class="data-[state=checked]:border-destructive data-[state=checked]:bg-destructive/80"
              />
              <label
                for="skipConfirm"
                class="text-sm leading-none peer-disabled:opacity-70 peer-disabled:cursor-not-allowed"
              >
                {{ $t('modals.deleteFile.skipConfirm') }}
              </label>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ $t('common.cancel') }}</AlertDialogCancel>
        <AlertDialogAction variant="destructive" @click="handleConfirm">
          {{ $t('common.moveToTrash') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
