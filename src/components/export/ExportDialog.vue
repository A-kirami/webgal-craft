<script setup lang="ts">
import { Check, ExternalLink, FolderOpen, Globe2, Loader2, Share2 } from '@lucide/vue'
import { storeToRefs } from 'pinia'

import { confirmExportOverwrite } from '~/features/export/confirmExportOverwrite'
import { formatExportElapsedSeconds } from '~/features/export/useExportElapsedTimer'
import { useWebExportDialog } from '~/features/export/useWebExportDialog'
import { useStorageSettingsStore } from '~/stores/storage-settings'

import type { Game } from '~/database/model'
import type { ExportTask, ExportType } from '~/features/export/useWebExportDialog'

interface Props {
  game: Game
}

const props = defineProps<Props>()
const open = defineModel<boolean>('open', { default: false })
const { locale, t } = useI18n()
const { exportSavePath } = storeToRefs(useStorageSettingsStore())

const steps = computed(() => [
  { step: 1, label: t('export.steps.platform') },
  { step: 2, label: t('export.steps.configure') },
  { step: 3, label: t('export.steps.export') },
])
const currentStep = shallowRef(1)
const furthestStep = shallowRef(1)
const selectedPlatform = shallowRef<ExportType>()

const {
  canStart,
  desktopOutputPreview,
  elapsedMs,
  exportTasks,
  handleOpenChange,
  hasDesktopTargets,
  hasOutputTarget,
  isAndroid,
  isBusy,
  isRunning,
  openExportDirectory,
  outputPreview,
  outputRoot,
  prepareExportTasks,
  selectOutputRoot,
  selectedDesktopTargets,
  shareExport,
  startExport,
  windowConfig,
} = useWebExportDialog({
  confirmOverwrite: outputPath => confirmExportOverwrite(outputPath, t),
  defaultOutputRoot: exportSavePath,
  game: () => props.game,
  open,
  t,
})

watch(open, (isOpen) => {
  if (!isOpen) {
    return
  }
  currentStep.value = 1
  furthestStep.value = 1
  selectedPlatform.value = undefined
}, { immediate: true })

const selectedPlatformValid = computed(() => selectedPlatform.value === 'web' || (selectedPlatform.value === 'desktop' && hasDesktopTargets.value))
const canAdvance = computed(() => currentStep.value === 1 ? selectedPlatformValid.value : hasOutputTarget.value)
const hasFinishedTasks = computed(() => exportTasks.value.length > 0
  && !isBusy.value
  && exportTasks.value.every(task => task.status === 'completed' || task.status === 'failed'))
const hasFailedTasks = computed(() => exportTasks.value.some(task => task.status === 'failed'))

function isStepDisabled(step: number): boolean {
  if (isBusy.value || exportTasks.value.some(task => task.status === 'completed')) {
    return step !== currentStep.value
  }
  if (step > furthestStep.value) {
    return true
  }
  if (step === 2) {
    return !selectedPlatformValid.value
  }
  return step === 3 && !hasOutputTarget.value
}

function isStepComplete(step: number): boolean {
  return currentStep.value > step || (step === steps.value.length && exportTasks.value.every(task => task.status === 'completed') && exportTasks.value.length > 0)
}

function handleStepChange(step: number | undefined): void {
  if (step !== undefined && !isStepDisabled(step)) {
    if (step === 3) {
      prepareExportTasks(selectedPlatform.value)
    }
    currentStep.value = step
  }
}

function goToNextStep(): void {
  currentStep.value++
  furthestStep.value = Math.max(furthestStep.value, currentStep.value)
  if (currentStep.value === 3) {
    prepareExportTasks(selectedPlatform.value)
  }
}

function taskLabel(task: ExportTask): string {
  switch (task.platform) {
    case 'web': {
      return t('export.platformWeb')
    }
    case 'windows-x64': {
      return t('export.desktopConfig.targets.windowsX64')
    }
    case 'macos-x64': {
      return t('export.desktopConfig.targets.macosX64')
    }
    case 'macos-arm64': {
      return t('export.desktopConfig.targets.macosArm64')
    }
    case 'linux-x64': {
      return t('export.desktopConfig.targets.linuxX64')
    }
    default: {
      return t('export.platformDesktop')
    }
  }
}

function progressLabel(key: ExportTask['stepKey']): string {
  switch (key) {
    case 'export.progress.preparing': {
      return t('export.progress.preparing')
    }
    case 'export.progress.copyingEngine': {
      return t('export.progress.copyingEngine')
    }
    case 'export.progress.copyingGame': {
      return t('export.progress.copyingGame')
    }
    case 'export.progress.copyingIcons': {
      return t('export.progress.copyingIcons')
    }
    case 'export.progress.updatingManifest': {
      return t('export.progress.updatingManifest')
    }
    case 'export.progress.packingResources': {
      return t('export.progress.packingResources')
    }
    case 'export.progress.downloadingRuntime': {
      return t('export.progress.downloadingRuntime')
    }
    case 'export.progress.copyingRuntime': {
      return t('export.progress.copyingRuntime')
    }
    case 'export.progress.writingConfig': {
      return t('export.progress.writingConfig')
    }
    case 'export.progress.finished': {
      return t('export.progress.finished')
    }
    case 'export.progress.failed': {
      return t('export.progress.failed')
    }
    default: {
      return t('export.progress.ready')
    }
  }
}

function elapsedLabel(task: ExportTask): string | undefined {
  const duration = task.status === 'running' ? elapsedMs.value : task.elapsedMs
  if (duration === undefined || duration < 3000) {
    return
  }
  return t('export.elapsed.total', { seconds: formatExportElapsedSeconds(duration / 1000, toValue(locale)) })
}

function taskCardClass(task: ExportTask): string {
  if (task.status === 'completed') {
    return 'border-emerald-500/40'
  }
  if (task.status === 'failed') {
    return 'border-destructive/40'
  }
  return ''
}

function progressIndicatorClass(task: ExportTask): string {
  if (task.status === 'completed') {
    return 'bg-emerald-500 duration-200'
  }
  if (task.status === 'failed') {
    return 'bg-destructive duration-200'
  }
  return ''
}
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent class="max-w-2xl" @open-auto-focus="event => event.preventDefault()">
      <DialogHeader>
        <DialogTitle>{{ $t('export.title') }}</DialogTitle>
        <DialogDescription>{{ $t('export.description') }}</DialogDescription>
      </DialogHeader>

      <Stepper :model-value="currentStep" :linear="false" class="w-full items-start" @update:model-value="handleStepChange">
        <StepperItem
          v-for="item in steps"
          :key="item.step"
          class="flex-1 flex-col gap-2 relative"
          :disabled="isStepDisabled(item.step)"
          :step="item.step"
        >
          <StepperTrigger class="w-full">
            <StepperIndicator>
              <Check v-if="isStepComplete(item.step)" class="size-4" aria-hidden="true" />
              <span v-else>{{ item.step }}</span>
            </StepperIndicator>
            <StepperTitle class="text-sm">
              {{ item.label }}
            </StepperTitle>
            <StepperDescription class="h-4">
              <span aria-hidden="true">&nbsp;</span>
            </StepperDescription>
          </StepperTrigger>
          <StepperSeparator v-if="item.step < steps.length" class="h-px w-[calc(100%-3rem)] left-[calc(50%+1.5rem)] top-4 absolute" />
        </StepperItem>
      </Stepper>

      <div class="flex flex-col gap-5 min-h-56">
        <div v-if="currentStep === 1" class="flex flex-col gap-3">
          <ExportPlatformSelector
            :disabled="isBusy"
            :selected-platform="selectedPlatform"
            @select="selectedPlatform = $event"
          />
          <p v-if="!selectedPlatformValid" class="text-xs text-muted-foreground" role="status">
            {{ $t('export.selectPlatformHint') }}
          </p>
        </div>

        <div v-else-if="currentStep === 2" class="flex flex-col gap-5">
          <DesktopExportConfig
            v-if="selectedPlatform === 'desktop'"
            v-model:targets="selectedDesktopTargets"
            v-model:window-config="windowConfig"
            :disabled="isBusy"
          />
          <p v-else class="text-sm text-muted-foreground">
            {{ $t('export.desktopConfig.notSelected') }}
          </p>
          <ExportOutputDirectoryField
            :disabled="isBusy"
            :output-preview="selectedPlatform === 'desktop' ? desktopOutputPreview : outputPreview"
            :output-root="isAndroid ? outputPreview : outputRoot"
            :readonly="isAndroid"
            @select="selectOutputRoot"
          />
        </div>

        <div v-else class="flex flex-col gap-3">
          <section
            v-for="task in exportTasks"
            :key="task.platform"
            class="p-3 border rounded-md flex flex-col gap-2 transition-colors"
            :class="taskCardClass(task)"
            aria-live="polite"
            data-testid="export-card"
          >
            <div class="flex gap-3 items-center">
              <div class="border rounded-md bg-muted/40 shrink-0 grid size-9 place-content-center">
                <Globe2 v-if="task.platform === 'web'" class="size-4.5" aria-hidden="true" />
                <span v-else-if="task.platform === 'windows-x64'" class="i-simple-icons-windows size-4.5" aria-hidden="true" />
                <span v-else-if="task.platform === 'linux-x64'" class="i-simple-icons-linux size-4.5" aria-hidden="true" />
                <span v-else class="i-simple-icons-apple size-4.5" aria-hidden="true" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm leading-none font-medium truncate">
                  {{ taskLabel(task) }}
                </p>
                <p class="text-xs text-muted-foreground leading-4 mt-1.5 flex gap-1 min-w-0">
                  <span class="min-w-0 truncate">{{ progressLabel(task.stepKey) }}</span>
                  <span v-if="elapsedLabel(task)" class="shrink-0 tabular-nums">{{ elapsedLabel(task) }}</span>
                </p>
              </div>
              <TooltipProvider :delay-duration="300">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="shrink-0 size-8"
                      :class="task.status === 'completed' ? '' : 'invisible pointer-events-none'"
                      :aria-label="isAndroid ? $t('export.openFile') : $t('export.openDirectory')"
                      @click="openExportDirectory(task)"
                    >
                      <ExternalLink v-if="isAndroid" class="size-4" aria-hidden="true" />
                      <FolderOpen v-else class="size-4" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{{ isAndroid ? $t('export.openFile') : $t('export.openDirectory') }}</TooltipContent>
                </Tooltip>
                <Tooltip v-if="isAndroid">
                  <TooltipTrigger as-child>
                    <Button variant="ghost" size="icon" class="shrink-0 size-8" :aria-label="$t('export.share')" @click="shareExport">
                      <Share2 class="size-4" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{{ $t('export.share') }}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div class="flex gap-2 items-center">
              <Progress :model-value="task.progress" class="flex-1" :indicator-class="progressIndicatorClass(task)" />
              <span class="text-xs text-muted-foreground text-right shrink-0 w-9 tabular-nums">{{ Math.round(task.progress) }}%</span>
            </div>
          </section>
          <p v-if="exportTasks.length === 0" class="text-sm text-muted-foreground">
            {{ $t('export.progress.ready') }}
          </p>
        </div>
      </div>

      <DialogFooter class="min-h-9">
        <Button v-if="hasFinishedTasks && !hasFailedTasks" @click="handleOpenChange(false)">
          {{ $t('export.done') }}
        </Button>
        <template v-else>
          <Button v-if="currentStep > 1" variant="outline" :disabled="isBusy" @click="currentStep--">
            {{ $t('export.previousStep') }}
          </Button>
          <Button v-if="currentStep < 3" :disabled="!canAdvance || isBusy" @click="goToNextStep">
            {{ $t('export.next') }}
          </Button>
          <Button v-else class="gap-1.5" :disabled="!canStart || !selectedPlatformValid" @click="startExport(selectedPlatform)">
            <Loader2 v-if="isRunning" class="size-4 animate-spin" aria-hidden="true" />
            {{ isRunning ? $t('export.exporting') : hasFailedTasks ? $t('export.retry') : $t('export.start') }}
          </Button>
        </template>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
