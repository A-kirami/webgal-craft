<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'

const open = defineModel<boolean>('open')

const props = defineProps<{
  engine: Engine
}>()

function handleConfirm() {
  engineManager.uninstallEngine(props.engine)
  notify.success('引擎卸载成功')
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
            卸载引擎
          </AlertDialogTitle>
          <AlertDialogDescription>
            <p>确定要卸载引擎 <span class="text-black font-bold">{{ engine.metadata.name }}</span> 吗？</p>
            <p>此操作将删除引擎文件，且无法恢复。</p>
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
