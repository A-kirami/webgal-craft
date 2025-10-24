<script setup lang="ts">
import { ArrowLeft, Download, Play, Settings } from 'lucide-vue-next'

const router = useRouter()

const handleBack = () => {
  router.back()
}

const workspaceStore = useWorkspaceStore()
const modalStore = useModalStore()
</script>

<template>
  <header class="px-4 border-b bg-white flex h-12 items-center justify-between dark:bg-gray-950">
    <div class="flex gap-2 items-center">
      <Button variant="ghost" size="icon" class="size-8" @click="handleBack">
        <ArrowLeft class="size-5!" />
        <span class="sr-only">返回</span>
      </Button>
      <div class="flex gap-2 cursor-pointer items-center" @click="modalStore.open('GameConfigModal')">
        <Thumbnail :path="workspaceStore.currentGame?.metadata.icon" :alt="`${workspaceStore.currentGame?.metadata.name} 游戏图标`" fallback-image="/placeholder.svg" class="rounded-md size-6" />
        <span class="font-medium">{{ workspaceStore.currentGame?.metadata.name }}</span>
      </div>
    </div>
    <div class="flex gap-2 items-center">
      <Button variant="default" size="sm" class="gap-1 h-8">
        <Play class="size-4" />
        测试游戏
      </Button>
      <Button variant="outline" size="sm" class="gap-1 h-8">
        <Download class="size-4" />
        导出
      </Button>
      <Button variant="ghost" size="icon" class="h-8 w-8" @click="modalStore.open('SettingsModal')">
        <Settings class="size-4" />
        <span class="sr-only">设置</span>
      </Button>
    </div>
  </header>
</template>
