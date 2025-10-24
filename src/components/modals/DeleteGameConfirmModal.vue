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
            最终确认
          </DialogTitle>
          <DialogDescription class="sm:text-center">
            此操作无法撤销。请输入游戏名称
            <span class="text-foreground font-bold">{{ game.metadata.name }}</span>
            以确认删除。
          </DialogDescription>
        </DialogHeader>
      </div>

      <form class="space-y-5">
        <div class="space-y-2">
          <Label for="game-name">游戏名称</Label>
          <Input
            id="game-name"
            v-model="confirmInput"
            type="text"
            :placeholder="`请输入 ${game.metadata.name} 以确认`"
          />
        </div>
        <DialogFooter>
          <DialogClose as-child>
            <Button type="button" variant="outline" class="flex-1">
              取消
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            class="flex-1"
            :disabled="confirmInput !== game.metadata.name"
            @click="handleConfirm"
          >
            确认删除
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
