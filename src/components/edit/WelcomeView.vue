<script setup lang="ts">
import { FileText, Plus } from 'lucide-vue-next'
</script>

<template>
  <div class="flex h-full items-center justify-center">
    <div class="text-center space-y-4">
      <div class="text-muted-foreground">
        <FileText class="mx-auto mb-2 opacity-50 h-12 w-12" />
      </div>
      <h3 class="text-lg font-medium">
        开始编辑
      </h3>
      <p class="text-muted-foreground max-w-md">
        选择一个文件开始编辑，或创建新文件
      </p>
      <Button>
        <Plus class="mr-2 h-4 w-4" />
        新建文件
      </Button>
    </div>
  </div>
</template>
