<script setup lang="ts">
import { isDesktopRuntime } from '~/services/platform/runtime'

const isDesktop = isDesktopRuntime()
</script>

<template>
  <div class="grid grid-rows-[auto_minmax(0,1fr)] h-screen">
    <AppTitlebar v-if="isDesktop" />
    <RouterView />
  </div>
</template>
