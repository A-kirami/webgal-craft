<script setup lang="ts">
import { CircleAlert, CircleCheckBig, CircleX, Info } from '@lucide/vue'

const { type } = $defineProps<{
  type: IconType
}>()

const { t } = useI18n()

type IconType = 'info' | 'warning' | 'error' | 'success' | 'loading'

const icons = {
  info: Info,
  warning: CircleAlert,
  error: CircleX,
  success: CircleCheckBig,
}

const style = useCssModule()

const iconClass = (() => {
  return style[`icon${type[0].toUpperCase()}${type.slice(1)}`]
})()
</script>

<template>
  <span :class="[style.chip, iconClass]" class="inline-flex shrink-0 size-5 items-center justify-center">
    <div v-if="type === 'loading'" :class="style.spinner" role="status">
      <span class="sr-only">{{ t('common.loading') }}</span>
    </div>
    <component :is="icons[type as Exclude<IconType, 'loading'>]" v-else :size="20" />
  </span>
</template>

<style module>
/* 圆形色环用伪元素外扩 4px:视觉 28px,布局占位仍为 20px,不撑高 toast */
.chip {
  @apply relative;

  &::before {
    inset: -4px;
    z-index: -1;
    content: "";

    @apply absolute rounded-full;
  }
}

.icon-info {
  @apply text-blue-600 dark:text-blue-50;

  &::before {
    @apply bg-blue-50 dark:bg-blue-600/60;
  }
}

.icon-warning {
  @apply text-orange-600 dark:text-orange-50;

  &::before {
    @apply bg-orange-50 dark:bg-orange-600/60;
  }
}

.icon-error {
  @apply text-red-600 dark:text-red-50;

  &::before {
    @apply bg-red-50 dark:bg-red-600/60;
  }
}

.icon-success {
  @apply text-green-600 dark:text-green-50;

  &::before {
    @apply bg-green-50 dark:bg-green-600/60;
  }
}

.icon-loading {
  @apply text-blue-500 dark:text-blue-50;

  &::before {
    @apply bg-blue-50 dark:bg-blue-600/60;
  }
}

/* 18px:光学补偿,lucide 圆形图标在 20px 盒子里的实际外径约 18.3px */
.spinner {
  width: 18px;
  height: 18px;

  @apply border-2 border-current border-t-transparent rounded-full inline-block animate-spin;
}
</style>
