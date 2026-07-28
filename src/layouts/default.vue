<script setup lang="ts">
import { isDesktopRuntime } from '~/services/platform/runtime'

const isDesktop = isDesktopRuntime()
</script>

<template>
  <div
    class="grid h-dvh"
    :class="isDesktop ? 'grid-rows-[auto_minmax(0,1fr)]' : [$style.mobileSafeArea, 'grid-rows-[minmax(0,1fr)]']"
  >
    <AppTitlebar v-if="isDesktop" />
    <RouterView />
  </div>
</template>

<style module>
.mobile-safe-area {
  padding-block: env(safe-area-inset-top) env(safe-area-inset-bottom);
  padding-inline: env(safe-area-inset-left) env(safe-area-inset-right);
}
</style>
