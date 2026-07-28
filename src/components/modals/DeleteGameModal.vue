<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'

import { gameManager } from '~/services/game-manager'
import { isDesktopRuntime } from '~/services/platform/runtime'
import { useModalStore } from '~/stores/modal'

import type { Game } from '~/database/model'

let open = $(defineModel<boolean>('open'))

const { game } = defineProps<{
  game: Game
}>()

const { t } = useI18n()
let removeFiles = $ref(false)
let isConfirming = $ref(false)
const modalStore = useModalStore()

const isUnavailable = $computed(() => game.availability !== 'available')
const isDesktop = isDesktopRuntime()
const removeFilesLabel = isDesktop
  ? t('modals.deleteGame.moveFilesToTrash')
  : t('modals.deleteGame.deleteFiles')

async function performDelete(removeFiles: boolean): Promise<boolean> {
  try {
    await gameManager.deleteGame(game, removeFiles)
    return true
  } catch (error) {
    const fallbackMessage = isUnavailable
      ? t('modals.deleteGame.removeFailed')
      : t('modals.deleteGame.deleteFailed')
    logger.error(`${isUnavailable ? '移除游戏记录失败' : '删除游戏失败'}: ${error}`)
    toast.error(fallbackMessage)
    return false
  }
}

async function handleConfirm() {
  if (isConfirming) {
    return
  }
  isConfirming = true
  try {
    // 失效游戏：磁盘路径不可达，从列表移除时只删数据库记录，不再触碰文件
    if (isUnavailable) {
      if (await performDelete(false)) {
        open = false
      }
      return
    }

    if (removeFiles && !isDesktop) {
      modalStore.open('DeleteGameConfirmModal', {
        game,
        onConfirm: () => performDelete(true),
      })
    } else {
      if (await performDelete(removeFiles)) {
        open = false
      }
    }
  } finally {
    isConfirming = false
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
            {{ isUnavailable ? $t('modals.deleteGame.removeTitle') : $t('modals.deleteGame.title') }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            <i18n-t v-if="isUnavailable" keypath="modals.deleteGame.removeDescription" tag="p">
              <template #name>
                <span class="text-foreground font-bold">{{ game.metadata.name }}</span>
              </template>
            </i18n-t>
            <i18n-t v-else keypath="modals.deleteGame.description" tag="p">
              <template #name>
                <span class="text-foreground font-bold">{{ game.metadata.name }}</span>
              </template>
            </i18n-t>
            <p v-if="isUnavailable" class="text-sm text-muted-foreground mt-3">
              {{ $t('modals.deleteGame.removeWarning') }}
            </p>
            <div v-else class="mt-4 flex items-center space-x-2">
              <Checkbox id="removeFiles" ::="removeFiles" class="data-[state=checked]:border-destructive data-[state=checked]:bg-destructive/80" />
              <label
                for="removeFiles"
                class="text-sm leading-none font-medium peer-disabled:opacity-70 peer-disabled:cursor-not-allowed"
              >
                {{ removeFilesLabel }}
              </label>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ $t('common.cancel') }}</AlertDialogCancel>
        <Button variant="destructive" :disabled="isConfirming" @click="handleConfirm">
          {{ removeFiles && isDesktop ? $t('common.moveToTrash') : $t('common.confirm') }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
