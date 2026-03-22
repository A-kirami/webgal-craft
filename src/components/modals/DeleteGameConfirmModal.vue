<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'

import { Game } from '~/database/model'

let open = $(defineModel<boolean>('open'))
let confirmInput = $ref('')

const { game, onConfirm } = defineProps<{
  game: Game
  onConfirm: () => void
}>()

function handleConfirm() {
  onConfirm()
  open = false
}
</script>

<template>
  <Dialog ::open="open">
    <DialogContent>
      <div class="flex flex-col gap-2 items-center">
        <div
          class="text-destructive rounded-lg bg-destructive/10 flex shrink-0 size-9 items-center justify-center"
          aria-hidden="true"
        >
          <TriangleAlert class="size-5" aria-hidden="true" />
        </div>
        <DialogHeader>
          <DialogTitle class="sm:text-center">
            {{ $t('modals.deleteGameConfirm.title') }}
          </DialogTitle>
          <DialogDescription class="sm:text-center">
            <i18n-t keypath="modals.deleteGameConfirm.description">
              <template #name>
                <span class="text-foreground font-bold">{{ game.metadata.name }}</span>
              </template>
            </i18n-t>
          </DialogDescription>
        </DialogHeader>
      </div>

      <form class="space-y-5">
        <div class="space-y-2">
          <Label for="game-name">{{ $t('modals.deleteGameConfirm.gameName') }}</Label>
          <Input
            id="game-name"
            ::="confirmInput"
            type="text"
            :placeholder="$t('modals.deleteGameConfirm.placeholder', {
              name: game.metadata.name,
            })"
          />
        </div>
        <DialogFooter>
          <DialogClose as-child>
            <Button type="button" variant="outline" class="flex-1">
              {{ $t('common.cancel') }}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            class="flex-1"
            :disabled="confirmInput !== game.metadata.name"
            @click="handleConfirm"
          >
            {{ $t('modals.deleteGameConfirm.confirmDelete') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
