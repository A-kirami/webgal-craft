<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { fsCmds } from '~/commands/fs'

const { t } = useI18n()
let open = $(defineModel<boolean>('open'))

const props = defineProps<{
  file: {
    path: string
    name: string
    isDir?: boolean
  }
  onConfirm?: () => void | Promise<void>
}>()

const preferenceStore = usePreferenceStore()
const skipConfirm = $ref(preferenceStore.skipDeleteFileConfirm)

async function handleConfirm() {
  try {
    await fsCmds.deleteFile(props.file.path)
    toast.success(t('edit.fileTree.deleteSuccess'))
    preferenceStore.skipDeleteFileConfirm = skipConfirm
    await props.onConfirm?.()
    open = false
  } catch (error) {
    toast.error(error instanceof Error ? error.message : t('edit.fileTree.deleteFailed'))
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
              props.file.isDir
                ? $t('modals.deleteFile.folderTitle', { name: props.file.name })
                : $t('modals.deleteFile.title', { name: props.file.name })
            }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            <span>
              {{
                props.file.isDir
                  ? $t('modals.deleteFile.folderDescription')
                  : $t('modals.deleteFile.description')
              }}
            </span>
            <div class="mt-4 flex items-center space-x-2">
              <Checkbox
                id="skipConfirm"
                v-model="skipConfirm"
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
