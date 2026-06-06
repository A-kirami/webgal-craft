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
    :toast-options="{
      classes: {
        toast:
          'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
        description: 'group-[.toast]:text-muted-foreground',
        actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
        cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        closeButton: 'group-[.toast]:bg-background group-[.toast]:text-muted-foreground',
      },
    }"
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
    @apply flex;

    & [data-icon] {
      @apply w-auto h-auto;
    }

    & [data-content] {
      @apply min-w-0;
    }

    & [data-title] {
      @apply text-sm font-semibold;
    }

    & [data-description] {
      @apply text-sm;
    }

    & [data-button] {
      @apply ml-auto;
    }

    & [data-close-button] {
      @apply static border-none rounded-sm size-5 transform-none hover:bg-muted;

      bottom: auto;
      left: auto;

      & svg {
        @apply w-4 h-4;
      }
    }

    &:has([data-close-button]),
    &:has([data-button]) {
      @apply grid gap-x-3 items-start;

      grid-template-areas:
        "icon title title close"
        "icon description description description";
      grid-template-columns: auto minmax(0, 1fr) auto auto;
      row-gap: 0.125rem;

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
        margin-top: 0.375rem;
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
