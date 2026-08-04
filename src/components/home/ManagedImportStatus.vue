<script setup lang="ts">
import { X } from '@lucide/vue'

import { formatFileSize } from '~/utils/format'

import type { ManagedImportProgress } from '~/types/managed-import'

const props = defineProps<{
  canCancel: boolean
  progress?: ManagedImportProgress
}>()

const emit = defineEmits<{
  cancel: []
}>()

const { t } = useI18n()

const phaseLabels: Record<ManagedImportProgress['phase'], string> = {
  copying: 'home.managedImport.phase.copying',
  validating: 'home.managedImport.phase.validating',
  publishing: 'home.managedImport.phase.publishing',
  registering: 'home.managedImport.phase.registering',
}

const resourceLabels: Record<ManagedImportProgress['resourceKind'], string> = {
  game: 'home.managedImport.resource.game',
  engine: 'home.managedImport.resource.engine',
  template: 'home.managedImport.resource.template',
}

const percentage = computed(() => {
  const total = props.progress?.totalBytes
  if (!total || total <= 0) {
    return
  }
  return Math.min(100, Math.round((props.progress.copiedBytes / total) * 100))
})

// 映射表中的 key 是固定的本地化资源，只能在运行时按进度类型选择。
// eslint-disable-next-line @intlify/vue-i18n/no-dynamic-keys
const phaseLabel = computed(() => t(phaseLabels[props.progress?.phase ?? 'copying']))
// eslint-disable-next-line @intlify/vue-i18n/no-dynamic-keys
const resourceLabel = computed(() => t(resourceLabels[props.progress?.resourceKind ?? 'game']))
const progressDetail = computed(() => {
  const progressLabel = t('home.managedImport.copied', {
    bytes: formatFileSize(props.progress?.copiedBytes ?? 0),
    files: props.progress?.copiedFiles ?? 0,
  })
  return props.progress?.currentEntry
    ? t('home.managedImport.currentEntry', {
        entry: props.progress.currentEntry,
        summary: progressLabel,
      })
    : progressLabel
})
</script>

<template>
  <div
    class="mb-4 px-3 py-2 border rounded-md bg-background flex gap-3 items-center"
    role="status"
    aria-live="polite"
  >
    <div class="flex-1 min-w-0">
      <div class="text-sm mb-1 flex gap-2 items-baseline justify-between">
        <span class="font-medium truncate">
          {{ $t('home.managedImport.title', { resource: resourceLabel }) }}
        </span>
        <span class="text-xs text-muted-foreground shrink-0">{{ phaseLabel }}</span>
      </div>
      <Progress
        :model-value="percentage ?? 100"
        :aria-label="phaseLabel"
        :aria-valuenow="percentage"
        :indicator-class="percentage === undefined ? 'managed-import-indeterminate' : undefined"
        class="h-1.5"
      />
      <p class="text-xs text-muted-foreground mt-1 truncate">
        {{ progressDetail }}
      </p>
    </div>
    <Button
      v-if="canCancel"
      type="button"
      size="icon"
      variant="ghost"
      :aria-label="$t('home.managedImport.cancel')"
      class="shrink-0 size-9"
      @click="emit('cancel')"
    >
      <X class="size-4" />
    </Button>
  </div>
</template>

<style scoped>
:deep(.managed-import-indeterminate) {
  width: 40%;
  animation: managed-import-slide 1.2s ease-in-out infinite;
}

@keyframes managed-import-slide {
  0% { transform: translateX(-100%); }
  50% { transform: translateX(75%); }
  100% { transform: translateX(250%); }
}
</style>
