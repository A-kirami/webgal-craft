<script setup lang="ts">
import { X } from '@lucide/vue'

import { formatFileSize } from '~/utils/format'

import type {
  ImportResourceKind,
  ManagedImportActivity,
  ManagedImportProgress,
} from '~/types/managed-import'

const props = defineProps<{
  activity?: ManagedImportActivity
  canCancel: boolean
  progress?: ManagedImportProgress
  resourceKind?: ImportResourceKind
}>()

const emit = defineEmits<{
  cancel: []
}>()

const { t } = useI18n()

const phaseLabels = computed<Record<ManagedImportProgress['phase'], string>>(() => ({
  copying: t('home.managedImport.phase.copying'),
  downloading: t('home.managedImport.phase.downloading'),
  extracting: t('home.managedImport.phase.extracting'),
  validating: t('home.managedImport.phase.validating'),
  publishing: t('home.managedImport.phase.publishing'),
  registering: t('home.managedImport.phase.registering'),
}))

const resourceLabels = computed<Record<ManagedImportProgress['resourceKind'], string>>(() => ({
  game: t('home.managedImport.resource.game'),
  engine: t('home.managedImport.resource.engine'),
  template: t('home.managedImport.resource.template'),
}))

const resourceKind = computed(() => props.progress?.resourceKind ?? props.resourceKind ?? 'game')
const isOfficialEngineInstallation = computed(() => props.activity?.kind === 'official-engine-install')
const phase = computed<ManagedImportProgress['phase']>(() =>
  props.progress?.phase ?? (isOfficialEngineInstallation.value ? 'downloading' : 'copying'),
)

const percentage = computed(() => {
  const total = props.progress?.totalBytes
  if (!total || total <= 0) {
    return
  }
  return Math.min(100, Math.round((props.progress.copiedBytes / total) * 100))
})

const phaseLabel = computed(() => {
  if (isOfficialEngineInstallation.value && phase.value === 'downloading') {
    return t('home.managedImport.officialEngine.phase.downloading')
  }
  if (isOfficialEngineInstallation.value && phase.value === 'extracting') {
    return t('home.managedImport.officialEngine.phase.extracting')
  }
  return phaseLabels.value[phase.value]
})
const title = computed(() => {
  if (props.activity?.kind === 'official-engine-install') {
    return t('home.managedImport.officialEngine.title', {
      engineName: props.activity.engineName,
      engineVersion: props.activity.engineVersion,
    })
  }
  return t('home.managedImport.title', { resource: resourceLabels.value[resourceKind.value] })
})
const progressDetail = computed(() => {
  if (isOfficialEngineInstallation.value) {
    if (props.progress?.phase === 'downloading') {
      const downloaded = formatFileSize(props.progress.copiedBytes)
      return props.progress.totalBytes && props.progress.totalBytes > 0
        ? t('home.managedImport.officialEngine.downloadedWithTotal', {
            downloaded,
            total: formatFileSize(props.progress.totalBytes),
          })
        : t('home.managedImport.officialEngine.downloaded', { downloaded })
    }
    if (props.progress?.phase === 'extracting') {
      const summary = t('home.managedImport.officialEngine.extracted', {
        files: props.progress.copiedFiles,
      })
      return props.progress.currentEntry
        ? t('home.managedImport.currentEntry', {
            entry: props.progress.currentEntry,
            summary,
          })
        : summary
    }
    return
  }

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
          {{ title }}
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
      <p v-if="progressDetail" class="text-xs text-muted-foreground mt-1 truncate">
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
