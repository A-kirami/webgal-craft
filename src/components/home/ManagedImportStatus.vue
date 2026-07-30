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
  copying: t('home.managedImport.phase.copying'),
  validating: t('home.managedImport.phase.validating'),
  publishing: t('home.managedImport.phase.publishing'),
  registering: t('home.managedImport.phase.registering'),
}

const resourceLabels: Record<ManagedImportProgress['resourceKind'], string> = {
  game: t('home.managedImport.resource.game'),
  engine: t('home.managedImport.resource.engine'),
  template: t('home.managedImport.resource.template'),
}

const percentage = computed(() => {
  const total = props.progress?.totalBytes
  if (!total || total <= 0) {
    return
  }
  return Math.min(100, Math.round((props.progress.copiedBytes / total) * 100))
})

const phaseLabel = computed(() => phaseLabels[props.progress?.phase ?? 'copying'])
const resourceLabel = computed(() => resourceLabels[props.progress?.resourceKind ?? 'game'])
const progressLabel = computed(() => t('home.managedImport.copied', {
  bytes: formatFileSize(props.progress?.copiedBytes ?? 0),
  files: props.progress?.copiedFiles ?? 0,
}))
const progressDetail = computed(() => props.progress?.currentEntry
  ? t('home.managedImport.currentEntry', {
      entry: props.progress.currentEntry,
      summary: progressLabel.value,
    })
  : progressLabel.value,
)
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
