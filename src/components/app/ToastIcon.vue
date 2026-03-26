<script setup lang="tsx">
import { CircleCheckBig, Info, OctagonX, TriangleAlert } from 'lucide-vue-next'

const { type } = $defineProps<{
  type: IconType
}>()

const { t } = useI18n()

type IconType = 'info' | 'warning' | 'error' | 'success' | 'loading'

const Loading = (
  <div
    class="border-[3px] border-current border-t-transparent rounded-full inline-block animate-spin"
    role="status"
    aria-label="loading"
  >
    <span class="sr-only">{t('common.loading')}</span>
  </div>
)

const icons = {
  info: Info,
  warning: TriangleAlert,
  error: OctagonX,
  success: CircleCheckBig,
  loading: Loading,
}

const style = useCssModule()

const IconClass = (() => {
  return style[`icon${type[0].toUpperCase()}${type.slice(1)}`]
})()
</script>

<template>
  <div :class="IconClass" class="rounded-lg inline-flex shrink-0 size-8 items-center justify-center">
    <component :is="icons[type as IconType]" class="size-5" />
  </div>
</template>

<style module>
.icon-info {
  @apply bg-blue-50 text-blue-300 dark:bg-blue-600/60 dark:text-blue-50;
}

.icon-warning {
  @apply bg-orange-50 text-orange-300 dark:bg-orange-600/60 dark:text-orange-50;
}

.icon-error {
  @apply bg-red-50 text-red-300 dark:bg-red-600/60 dark:text-red-50;
}

.icon-success {
  @apply bg-green-50 text-green-300 dark:bg-green-600/60 dark:text-green-50;
}

.icon-loading {
  @apply text-blue-400 dark:text-blue-300;
}
</style>
