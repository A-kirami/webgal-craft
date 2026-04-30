<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'

import { useDeleteConfirmation } from '~/composables/useDeleteConfirmation'
import { engineManager } from '~/services/engine-manager'

import type { Engine } from '~/database/model'

const { t } = useI18n()
const open = defineModel<boolean>('open')

const props = defineProps<{
  engine: Engine
}>()

const isUnavailable = $computed(() => props.engine.status === 'unavailable')
const engineDisplayName = $computed(() =>
  props.engine.version ? `${props.engine.name} ${props.engine.version}` : props.engine.name,
)

const { associatedGames, isDeleteBlocked, isConfirmDisabled, handleConfirm } =
  $(useDeleteConfirmation({
    open,
    identifier: () => props.engine.id,
    checkDelete: () => engineManager.canDeleteEngine(props.engine.id),
    performDelete: () => engineManager.uninstallEngine(props.engine),
    successMessage: () => isUnavailable
      ? t('modals.deleteEngine.removeSuccess')
      : t('modals.deleteEngine.uninstallSuccess'),
    fallbackErrorMessage: () => isUnavailable
      ? t('modals.deleteEngine.removeFailed')
      : t('modals.deleteEngine.uninstallFailed'),
    logPrefix: '读取引擎删除状态失败',
  }))

const dialogTitle = $computed(() => {
  if (isDeleteBlocked) {
    return t('engine.deleteBlocked')
  }

  if (isUnavailable) {
    return t('modals.deleteEngine.removeTitle')
  }

  return t('modals.deleteEngine.title')
})

const dialogDescription = $computed(() => {
  if (isDeleteBlocked) {
    return t('engine.deleteBlockedByGames')
  }

  if (isUnavailable) {
    return t('modals.deleteEngine.removeDescription', { name: engineDisplayName })
  }

  return t('modals.deleteEngine.description', { name: engineDisplayName })
})

const dialogWarning = $computed(() => {
  if (isDeleteBlocked) {
    return
  }

  return isUnavailable
    ? t('modals.deleteEngine.removeWarning')
    : t('modals.deleteEngine.warning')
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
