<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'

import { Game } from '~/database/model'
import { gameManager } from '~/services/game-manager'
import { useModalStore } from '~/stores/modal'

const { t } = useI18n()
let open = $(defineModel<boolean>('open'))

const { game } = defineProps<{
  game: Game
}>()

let removeFiles = $ref(false)
const modalStore = useModalStore()

function deleteGame() {
  gameManager.deleteGame(game, removeFiles)
  notify.success(t('modals.deleteGame.deleteSuccess'))
}

function handleConfirm() {
  if (removeFiles) {
    modalStore.open('DeleteGameConfirmModal', {
      game,
      onConfirm: deleteGame,
    })
  } else {
    deleteGame()
    open = false
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
            {{ $t('modals.deleteGame.title') }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            <i18n-t keypath="modals.deleteGame.description" tag="p">
              <template #name>
                <span class="text-foreground font-bold">{{ game.metadata.name }}</span>
              </template>
            </i18n-t>
            <div class="mt-4 flex items-center space-x-2">
              <Checkbox id="removeFiles" ::="removeFiles" class="data-[state=checked]:border-destructive data-[state=checked]:bg-destructive/80" />
              <label
                for="removeFiles"
                class="text-sm leading-none font-medium peer-disabled:opacity-70 peer-disabled:cursor-not-allowed"
              >
                {{ $t('modals.deleteGame.deleteFiles') }}
              </label>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ $t('common.cancel') }}</AlertDialogCancel>
        <AlertDialogAction variant="destructive" @click="handleConfirm">
          {{ $t('common.confirm') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
