<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'

defineProps<{
  message: string
}>()
</script>

<template>
  <div class="text-xs text-yellow-600 px-2 py-1.5 border border-yellow/25 rounded-md bg-yellow/10 flex gap-1.5 items-center dark:text-yellow-300">
    <TriangleAlert class="text-yellow shrink-0 size-4" aria-hidden="true" />
    {{ message }}
  </div>
</template>
