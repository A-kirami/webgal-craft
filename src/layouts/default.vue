<script setup lang="ts">
import { isDesktopRuntime } from '~/services/platform/runtime'

const isDesktop = isDesktopRuntime()
</script>

<template>
  <div
    class="grid h-screen"
    :class="isDesktop ? 'grid-rows-[auto_minmax(0,1fr)]' : 'grid-rows-[minmax(0,1fr)]'"
  >
    <AppTitlebar v-if="isDesktop" />
    <RouterView />
  </div>
</template>
