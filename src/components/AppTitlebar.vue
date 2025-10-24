<script setup lang="ts">
import { type as getOsType } from '@tauri-apps/plugin-os'
import InlineSvg from 'vue-inline-svg'

const osType = getOsType()
const route = useRoute()

const isHomePage = $computed(() => route.path === '/')
</script>

<template>
  <header
    data-tauri-drag-region
    class="text-gray-500 bg-background flex h-7 w-full"
  >
    <div v-show="!isHomePage" class="flex gap-1.5 items-center" :class="osType === 'macos' ? 'pl-20' : 'pl-2'">
      <InlineSvg src="/webgal-craft-logo.svg" class="size-5" alt="webgalcraft logo" />
      <InlineSvg src="/webgal-craft-text.svg" class="h-3 w-auto" alt="webgalcraft text" />
    </div>
    <WindowControls v-if="osType !== 'macos'" :justify="true" />
  </header>
</template>
