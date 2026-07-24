<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'

import { useDeleteConfirmation } from '~/composables/useDeleteConfirmation'
import { templateManager } from '~/services/template-manager'

import type { Template } from '~/database/model'

const { t } = useI18n()
const open = defineModel<boolean>('open')

const props = defineProps<{
  template: Template
}>()

const isUnavailable = $computed(() => props.template.availability !== 'available')
const templateName = $computed(() => props.template.metadata.name)

const { associatedGames, uncheckedGames, isDeleteBlocked, isConfirmDisabled, handleConfirm } =
  $(useDeleteConfirmation({
    open,
    identifier: () => `${props.template.id}:${props.template.metadata.name}`,
    checkDelete: () => templateManager.canDeleteTemplate(templateName),
    performDelete: () => templateManager.deleteTemplate(props.template),
    fallbackErrorMessage: () => isUnavailable
      ? t('modals.deleteTemplate.removeFailed')
      : t('modals.deleteTemplate.deleteFailed'),
    logPrefix: '读取模板删除状态失败',
    deleteLogPrefix: '删除模板失败',
  }))

const blockedGames = $computed(() => uncheckedGames.length > 0 ? uncheckedGames : associatedGames)

const dialogTitle = $computed(() => {
  if (isDeleteBlocked) {
    return t('modals.deleteTemplate.blockedTitle')
  }

  if (isUnavailable) {
    return t('modals.deleteTemplate.removeTitle')
  }

  return t('modals.deleteTemplate.title')
})

const dialogDescription = $computed(() => {
  if (isDeleteBlocked) {
    if (uncheckedGames.length > 0) {
      return t('modals.deleteTemplate.blockedByUncheckedGames')
    }

    return t('modals.deleteTemplate.blockedByGames')
  }

  if (isUnavailable) {
    return t('modals.deleteTemplate.removeDescription', { name: templateName })
  }

  return t('modals.deleteTemplate.description', { name: templateName })
})

const dialogWarning = $computed(() => {
  if (isDeleteBlocked) {
    return
  }

  return isUnavailable
    ? t('modals.deleteTemplate.removeWarning')
    : t('modals.deleteTemplate.warning')
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
            <ul v-if="blockedGames.length > 0" class="text-sm mt-3 pl-5 list-disc">
              <li v-for="game in blockedGames" :key="game.id">
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
        <AlertDialogAction variant="destructive" :disabled="isConfirmDisabled" @click="handleConfirm">
          {{ $t('common.confirm') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
