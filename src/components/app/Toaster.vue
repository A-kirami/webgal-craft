<script setup lang="ts">
import { Toaster } from 'vue-sonner'

import type { ToasterProps } from 'vue-sonner'

const props = defineProps<ToasterProps>()
</script>

<template>
  <Toaster
    v-bind="props"
    close-button
    class="group toaster pointer-events-auto"
  >
    <template #loading-icon>
      <ToastIcon type="loading" />
    </template>
    <template #success-icon>
      <ToastIcon type="success" />
    </template>
    <template #error-icon>
      <ToastIcon type="error" />
    </template>
    <template #info-icon>
      <ToastIcon type="info" />
    </template>
    <template #warning-icon>
      <ToastIcon type="warning" />
    </template>
  </Toaster>
</template>

<style>
@import "vue-sonner/style.css";

.toaster[data-sonner-toaster] {
  --width: 20rem !important;
  --offset: 1.25rem !important;

  & [data-sonner-toast] {
    @apply flex px-4 py-3 bg-background text-foreground border-border shadow;

    /* vue-sonner 内置给图标 svg -1px 左外边距(补偿自家图标),会破坏色环居中,归零 */
    --toast-svg-margin-start: 0px;

    & [data-icon] {
      @apply w-auto h-auto;
    }

    /* 无关闭按钮的 toast(loading)走 flex,图标贴标题第一行而非整行居中 */
    &:not(:has([data-close-button]), :has([data-button])) [data-icon] {
      align-self: flex-start;
    }

    & [data-content] {
      @apply min-w-0;
    }

    & [data-title] {
      @apply text-sm font-medium;
    }

    & [data-description] {
      @apply text-[13px] text-muted-foreground;
    }

    & [data-button] {
      @apply ml-auto;
    }

    & [data-action] {
      @apply bg-primary text-primary-foreground rounded px-3 py-1.5 text-xs font-medium;
    }

    & [data-cancel] {
      @apply bg-muted text-muted-foreground rounded px-3 py-1.5 text-xs font-medium;
    }

    /* 触发区 24px(Button icon-xs 档),-m-0.5 补偿保持字形光学位置 */
    & [data-close-button] {
      @apply static border-none rounded-md size-6 -m-0.5 transform-none text-muted-foreground hover:bg-accent hover:text-accent-foreground;

      bottom: auto;
      left: auto;

      & svg {
        @apply size-3.5;
      }
    }

    &:has([data-close-button]),
    &:has([data-button]) {
      @apply grid gap-x-2 items-start;

      grid-template-areas:
        "icon title title close"
        "icon description description description";
      grid-template-columns: auto minmax(0, 1fr) auto auto;
      row-gap: 0.25rem;

      & [data-icon] {
        grid-area: icon;
      }

      & [data-content] {
        display: contents;
      }

      & [data-title] {
        grid-area: title;
        min-width: 0;
      }

      & [data-description] {
        grid-area: description;
        min-width: 0;
      }

      & [data-close-button] {
        grid-area: close;
        place-self: start end;
      }
    }

    &:has([data-button]) {
      grid-template-areas:
        "icon title title close"
        "icon description description description"
        ". . cancel action";

      & [data-cancel] {
        grid-area: cancel;
      }

      & [data-action] {
        grid-area: action;
      }

      & [data-button] {
        @apply ml-0;

        justify-self: end;
        width: max-content;
        margin-top: 0.5rem;
        white-space: nowrap;
      }
    }

    &:has([data-button]):not(:has([data-description])) {
      grid-template-areas:
        "icon title title close"
        "icon . cancel action";
      row-gap: 0.5rem;

      & [data-button] {
        margin-top: 0;
      }
    }

    &:has([data-close-button]):not(:has([data-button]), :has([data-description])) {
      grid-template-areas: "icon title title close";
      row-gap: 0;
    }
  }
}
</style>
