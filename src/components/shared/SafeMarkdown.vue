<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'

import { isSafeWebUrl, renderSafeMarkdown } from './safe-markdown-renderer'

const props = defineProps<{
  source?: string
}>()

const renderedHtml = $computed(() => renderSafeMarkdown(props.source))

function handleClick(event: MouseEvent): void {
  const target = event.target
  if (!(target instanceof Element)) {
    return
  }

  const anchor = target.closest('a')
  const href = anchor?.getAttribute('href')
  if (!isSafeWebUrl(href)) {
    return
  }

  event.preventDefault()
  void openUrl(href)
}
</script>

<template>
  <!-- eslint-disable vue/no-v-html -->
  <!-- renderedHtml 已经过 DOMPurify 清理。 -->
  <div
    :class="$style.safeMarkdown"
    data-testid="safe-markdown"
    @click="handleClick"
    v-html="renderedHtml"
  />
  <!-- eslint-enable vue/no-v-html -->
</template>

<style scoped module>
.safe-markdown {
  @apply text-sm leading-6 text-foreground break-words;

  :deep(:first-child) {
    @apply mt-0;
  }

  :deep(:last-child) {
    @apply mb-0;
  }

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4),
  :deep(h5),
  :deep(h6) {
    @apply mt-4 mb-2 text-sm font-semibold;
  }

  :deep(p),
  :deep(ul),
  :deep(ol),
  :deep(pre),
  :deep(blockquote),
  :deep(table) {
    @apply my-2;
  }

  :deep(div[align="center"]) {
    @apply text-center;
  }

  :deep([align="center"] img) {
    @apply mx-auto;
  }

  :deep(ul) {
    @apply pl-5 list-disc;
  }

  :deep(ol) {
    @apply pl-5 list-decimal;
  }

  :deep(a) {
    @apply text-primary underline underline-offset-3 cursor-pointer;
  }

  :deep(code) {
    @apply rounded bg-muted px-1 py-0.5 text-xs font-mono;
  }

  :deep(kbd) {
    @apply rounded border bg-background px-1.5 py-0.5 text-xs font-mono;
  }

  :deep(pre) {
    @apply overflow-auto rounded-md bg-muted p-3;
  }

  :deep(pre code) {
    @apply bg-transparent p-0;
  }

  :deep(blockquote) {
    @apply border-l-2 border-border pl-3 text-muted-foreground;
  }

  :deep(img) {
    @apply max-w-full h-auto rounded-md;
  }

  :deep(input[type="checkbox"]) {
    @apply mr-2 align-middle;
  }

  :deep(table) {
    @apply w-full border-collapse text-xs;
  }

  :deep(th),
  :deep(td) {
    @apply border border-border px-2 py-1 text-left;
  }
}
</style>
