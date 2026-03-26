<script setup lang="tsx">
const { theme } = $defineProps<{
  theme: 'light' | 'dark' | 'system'
}>()

const AppMiniMap = (
  <div class="p-1 rounded-sm bg-[--color-background] flex flex-col gap-0.75 h-full">
    <div class="rounded-xs bg-[--color-contrast] h-1.5" />
    <div class="flex flex-1 gap-0.75">
      <div class="rounded-xs bg-[--color-contrast] w-4" />
      <div class="flex flex-col gap-0.75 w-10">
        <div class="rounded-xs bg-[--color-contrast] h-full" />
        <div class="rounded-xs bg-[--color-contrast] h-5" />
      </div>
      <div class="rounded-xs bg-[--color-contrast] w-9" />
    </div>
  </div>
)
</script>

<template>
  <div
    v-if="theme !== 'system'"
    :class="[$style.theme, $style[theme]]"
    class="p-0.5 border-2 border-muted rounded-md h-18 w-28 hover:border-accent"
  >
    <AppMiniMap />
  </div>
  <div v-else class="border-2 border-muted rounded-md h-18 w-28 relative hover:border-accent">
    <div
      :class="[$style.theme, $style.light]"
      class="rounded-md bg-[--color-background] inset-0.5 absolute"
      style="clip-path: polygon(0 0, 75% 0, 25% 100%, 0 100%);"
    >
      <AppMiniMap />
    </div>
    <div
      :class="[$style.theme, $style.dark]"
      class="rounded-md bg-[--color-background] inset-0.5 absolute"
      style="clip-path: polygon(75% 0, 100% 0%, 100% 100%, 25% 100%);"
    >
      <AppMiniMap />
    </div>
  </div>
</template>

<style module>
.theme {
  &.light {
    --color-primary: rgb(241 243 245);
    --color-contrast: rgb(222 226 230);
    --color-background: rgb(245 245 245);
  }

  &.dark {
    --color-primary: rgb(28 30 33);
    --color-contrast: rgb(52 58 64);
    --color-background: rgb(0 0 0);
  }
}
</style>
