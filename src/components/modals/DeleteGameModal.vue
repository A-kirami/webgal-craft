<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'

const open = defineModel<boolean>('open')

const props = defineProps<{
  game: Game
}>()

const removeFiles = $ref(false)
const modalStore = useModalStore()

function deleteGame() {
  gameManager.deleteGame(props.game, removeFiles)
  notify.success('游戏删除成功')
}

function handleConfirm() {
  if (removeFiles) {
    modalStore.open('DeleteGameConfirmModal', {
      game: props.game,
      onConfirm: deleteGame,
    })
  } else {
    deleteGame()
    open.value = false
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
            删除游戏
          </AlertDialogTitle>
          <AlertDialogDescription>
            <p>确定要删除游戏 <span class="text-black font-bold">{{ game.metadata.name }}</span> 吗？</p>
            <div class="mt-4 flex items-center space-x-2">
              <Checkbox id="removeFiles" v-model="removeFiles" class="data-[state=checked]:border-destructive data-[state=checked]:bg-destructive/80" />
              <label
                for="removeFiles"
                class="text-sm leading-none font-medium peer-disabled:opacity-70 peer-disabled:cursor-not-allowed"
              >
                同时删除游戏文件
              </label>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>取消</AlertDialogCancel>
        <AlertDialogAction variant="destructive" @click="handleConfirm">
          确认
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
