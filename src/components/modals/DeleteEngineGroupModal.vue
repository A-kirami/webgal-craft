<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'

import { useDeleteConfirmation } from '~/composables/useDeleteConfirmation'
import { engineManager } from '~/services/engine-manager'

const { t } = useI18n()
const open = defineModel<boolean>('open')

const props = defineProps<{
  engineId: string
  groupName: string
  allUnavailable?: boolean
}>()

const { associatedGames, isDeleteBlocked, isConfirmDisabled, handleConfirm } =
  $(useDeleteConfirmation({
    open,
    identifier: () => props.engineId,
    checkDelete: () => engineManager.canDeleteEngineGroup(props.engineId),
    performDelete: () => engineManager.uninstallEngineGroup(props.engineId),
    successMessage: () => props.allUnavailable
      ? t('modals.deleteEngineGroup.removeSuccess')
      : t('modals.deleteEngineGroup.success'),
    fallbackErrorMessage: () => props.allUnavailable
      ? t('modals.deleteEngineGroup.removeFailed')
      : t('modals.deleteEngineGroup.failed'),
    logPrefix: '读取引擎分组删除状态失败',
  }))

const dialogTitle = $computed(() => {
  if (isDeleteBlocked) {
    return t('engine.deleteBlocked')
  }

  if (props.allUnavailable) {
    return t('modals.deleteEngineGroup.removeTitle')
  }

  return t('modals.deleteEngineGroup.title')
})

const dialogDescription = $computed(() => {
  if (isDeleteBlocked) {
    return t('engine.deleteBlockedByGames')
  }

  if (props.allUnavailable) {
    return t('modals.deleteEngineGroup.removeDescription', { name: props.groupName })
  }

  return t('modals.deleteEngineGroup.description', { name: props.groupName })
})

const dialogWarning = $computed(() => {
  if (isDeleteBlocked) {
    return
  }

  return props.allUnavailable
    ? t('modals.deleteEngineGroup.removeWarning')
    : t('modals.deleteEngineGroup.warning')
})
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
            {{ dialogTitle }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            <p>{{ dialogDescription }}</p>
            <ul v-if="isDeleteBlocked" class="text-sm mt-3 pl-5 list-disc">
              <li v-for="game in associatedGames" :key="game.id">
                {{ game.metadata.name }}
              </li>
            </ul>
            <p v-if="dialogWarning">
              {{ dialogWarning }}
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ $t('common.cancel') }}</AlertDialogCancel>
        <AlertDialogAction :disabled="isConfirmDisabled" variant="destructive" @click="handleConfirm">
          {{ $t('common.confirm') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
