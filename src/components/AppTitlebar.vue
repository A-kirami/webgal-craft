<script setup lang="ts">
import { type as getOsType } from '@tauri-apps/plugin-os'

const osType = getOsType()
const route = useRoute()

const isHomePage = $computed(() => route.path === '/')
</script>

<template>
  <header
    data-tauri-drag-region
    class="text-gray-500 bg-background flex h-7 w-full relative"
  >
    <div v-show="!isHomePage" class="flex gap-1.5 items-center left-1/2 top-1/2 absolute -translate-x-1/2 -translate-y-1/2" :class="osType === 'macos' ? 'pl-20' : 'pl-2'">
      <img src="/webgal-craft-logo.svg" class="size-5" alt="webgalcraft logo">
      <!-- eslint-disable-next-line @intlify/vue-i18n/no-raw-text -->
      <div class="text-sm font-medium">
        WebGAL Craft
      </div>
    </div>
    <WindowControls v-if="osType !== 'macos'" :justify="true" />
  </header>
</template>
