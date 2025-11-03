<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'

const open = defineModel<boolean>('open')
const confirmInput = ref('')

const props = defineProps<{
  game: Game
  onConfirm: () => void
}>()

function handleConfirm() {
  props.onConfirm()
  open.value = false
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
            v-model="confirmInput"
            type="text"
            :placeholder="$t('modals.deleteGameConfirm.placeholder', {
              name: props.game.metadata.name,
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
