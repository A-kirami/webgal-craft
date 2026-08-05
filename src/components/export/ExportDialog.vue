<script setup lang="ts">
import { Check, ExternalLink, FolderOpen, Globe2, Loader2, Share2 } from '@lucide/vue'
import { storeToRefs } from 'pinia'

import { confirmExportOverwrite } from '~/features/export/confirmExportOverwrite'
import { formatExportElapsedSeconds } from '~/features/export/useExportElapsedTimer'
import { useWebExportDialog } from '~/features/export/useWebExportDialog'
import { useStorageSettingsStore } from '~/stores/storage-settings'

import type { Game } from '~/database/model'

interface Props {
  game: Game
}

const props = defineProps<Props>()
const open = defineModel<boolean>('open', { default: false })
const { locale, t } = useI18n()
const storageSettingsStore = useStorageSettingsStore()
const { exportSavePath } = storeToRefs(storageSettingsStore)

const steps = $computed(() => [
  { step: 1, label: t('export.steps.platform') },
  { step: 2, label: t('export.steps.configure') },
  { step: 3, label: t('export.steps.export') },
])

let currentStep = $ref(1)
let furthestStep = $ref(1)
let isWebSelected = $ref(true)

const {
  canStart,
  elapsedMs,
  handleOpenChange,
  hasOutputTarget,
  isAndroid,
  isBusy,
  isRunning,
  openExportDirectory,
  outputPreview,
  outputRoot,
  progress,
  selectOutputRoot,
  shareExport,
  startExport,
  status,
  stepKey,
} = $(useWebExportDialog({
  confirmOverwrite: outputPath => confirmExportOverwrite(outputPath, t),
  defaultOutputRoot: exportSavePath,
  game: () => props.game,
  open,
  t,
}))
const elapsedLabel = $computed(() => {
  if (elapsedMs === undefined || status === 'idle' || status === 'running') {
    return
  }

  const seconds = formatExportElapsedSeconds(
    Math.max(0.1, elapsedMs / 1000),
    toValue(locale),
  )
  return t('export.elapsed.total', { seconds })
})
const exportCardStateClass = $computed(() => {
  if (status === 'completed') {
    return 'border-emerald-500/40'
  }
  if (status === 'failed') {
    return 'border-destructive/40'
  }
  return ''
})
const exportPlatformIconStateClass = $computed(() => {
  if (status === 'completed') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
  }
  if (status === 'failed') {
    return 'border-destructive/30 bg-destructive/10 text-destructive'
  }
  return 'bg-muted/40'
})
const exportProgressIndicatorClass = $computed(() => {
  if (status === 'completed') {
    return 'bg-emerald-500 duration-200'
  }
  if (status === 'failed') {
    return 'bg-destructive duration-200'
  }
  return ''
})

watch(open, (isOpen) => {
  if (isOpen) {
    currentStep = 1
    furthestStep = 1
    isWebSelected = true
  }
}, { immediate: true })

function isStepDisabled(step: number): boolean {
  if (isBusy || status === 'completed') {
    return step !== currentStep
  }
  if (step > furthestStep) {
    return true
  }
  if (step === 2) {
    return !isWebSelected
  }
  if (step === 3) {
    return !hasOutputTarget
  }
  return false
}

function isStepComplete(step: number): boolean {
  return currentStep > step || (step === steps.length && status === 'completed')
}

function handleStepChange(step: number | undefined): void {
  if (step === undefined || isStepDisabled(step)) {
    return
  }

  currentStep = step
}

function goToNextStep(): void {
  if (currentStep >= steps.length) {
    return
  }

  currentStep++
  furthestStep = Math.max(furthestStep, currentStep)
}

function goToPreviousStep(): void {
  if (currentStep > 1) {
    currentStep--
  }
}

function progressLabel(key: string): string {
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
    case 'export.progress.compressing': {
      return t('export.progress.compressing')
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

const startLabel = $computed(() => status === 'failed'
  ? t('export.retry')
  : t('export.start'),
)
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent class="max-w-2xl" @open-auto-focus="event => event.preventDefault()">
      <DialogHeader>
        <DialogTitle>{{ $t('export.title') }}</DialogTitle>
        <DialogDescription>
          {{ $t('export.description') }}
        </DialogDescription>
      </DialogHeader>

      <Stepper
        :model-value="currentStep"
        :linear="false"
        class="w-full items-start"
        @update:model-value="handleStepChange"
      >
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
          <StepperSeparator
            v-if="item.step < steps.length"
            class="h-px w-[calc(100%-3rem)] left-[calc(50%+1.5rem)] top-4 absolute"
          />
        </StepperItem>
      </Stepper>

      <div class="flex flex-col gap-5 min-h-56">
        <div v-if="currentStep === 1" class="flex flex-col gap-3">
          <ExportPlatformSelector
            :disabled="isBusy"
            :selected="isWebSelected"
            @toggle="isWebSelected = !isWebSelected"
          />
          <p
            v-if="!isWebSelected"
            class="text-xs text-muted-foreground"
            role="status"
          >
            {{ $t('export.selectPlatformHint') }}
          </p>
        </div>

        <div v-else-if="currentStep === 2" class="flex flex-col gap-3">
          <ExportOutputDirectoryField
            :disabled="isBusy"
            :output-preview="outputPreview"
            :output-root="isAndroid ? outputPreview : outputRoot"
            :readonly="isAndroid"
            @select="selectOutputRoot"
          />
        </div>

        <div v-else-if="currentStep === 3" class="flex flex-col gap-5">
          <section
            class="p-3 border rounded-md flex flex-col gap-2 transition-colors duration-200"
            :class="exportCardStateClass"
            aria-live="polite"
            data-testid="export-card"
          >
            <!-- 行1：平台图标 + 名称/日志 + 打开目录（始终占位） -->
            <div class="flex gap-3 items-center">
              <div
                class="border rounded-md flex shrink-0 size-9 transition-colors duration-200 items-center justify-center"
                :class="exportPlatformIconStateClass"
                data-testid="export-platform-icon"
              >
                <Globe2 class="size-4.5" aria-hidden="true" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm leading-none font-medium truncate">
                  {{ $t('export.platformWeb') }}
                </p>
                <p
                  class="text-xs text-muted-foreground leading-4 mt-1.5 flex gap-1 min-w-0 items-center"
                  data-testid="export-log-summary"
                >
                  <span class="min-w-0 truncate">{{ progressLabel(stepKey) }}</span>
                  <template v-if="elapsedLabel">
                    <span class="shrink-0" aria-hidden="true">{{ $t('export.elapsed.separator') }}</span>
                    <span class="shrink-0 tabular-nums">{{ elapsedLabel }}</span>
                  </template>
                </p>
              </div>
              <div class="flex shrink-0 items-center">
                <TooltipProvider :delay-duration="300">
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <Button
                        variant="ghost"
                        size="icon"
                        class="shrink-0 size-8 transition-opacity"
                        :class="status !== 'completed' ? 'invisible pointer-events-none' : ''"
                        :aria-label="isAndroid ? $t('export.openFile') : $t('export.openDirectory')"
                        @click="openExportDirectory"
                      >
                        <ExternalLink v-if="isAndroid" class="size-4" aria-hidden="true" />
                        <FolderOpen v-else class="size-4" aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {{ isAndroid ? $t('export.openFile') : $t('export.openDirectory') }}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip v-if="isAndroid">
                    <TooltipTrigger as-child>
                      <Button
                        variant="ghost"
                        size="icon"
                        class="shrink-0 size-8 transition-opacity"
                        :class="status !== 'completed' ? 'invisible pointer-events-none' : ''"
                        :aria-label="$t('export.share')"
                        @click="shareExport"
                      >
                        <Share2 class="size-4" aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {{ $t('export.share') }}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            <!-- 行2：进度条 + 百分比（固定，不受其他内容影响） -->
            <div class="flex gap-2 items-center">
              <Progress
                :model-value="progress"
                class="flex-1"
                :indicator-class="exportProgressIndicatorClass"
              />
              <span class="text-xs text-muted-foreground text-right shrink-0 w-9 tabular-nums" aria-hidden="true">{{ Math.round(progress) }}%</span>
            </div>
            <p
              v-if="isAndroid && status === 'completed'"
              class="text-xs text-muted-foreground truncate"
              :title="outputPreview"
            >
              {{ outputPreview }}
            </p>
          </section>
        </div>
      </div>

      <DialogFooter class="min-h-9" data-testid="export-dialog-footer">
        <template v-if="status === 'completed'">
          <Button @click="handleOpenChange(false)">
            {{ $t('export.done') }}
          </Button>
        </template>
        <template v-else>
          <Button
            v-if="currentStep > 1"
            variant="outline"
            :disabled="isBusy"
            @click="goToPreviousStep"
          >
            {{ $t('export.previousStep') }}
          </Button>

          <Button
            v-if="currentStep < 3"
            :disabled="currentStep === 1 ? !isWebSelected : !hasOutputTarget"
            @click="goToNextStep"
          >
            {{ $t('export.next') }}
          </Button>
          <Button
            v-else
            class="gap-1.5"
            :disabled="!canStart"
            @click="startExport"
          >
            <Loader2 v-if="isRunning" class="size-4 animate-spin" aria-hidden="true" />
            {{ isRunning ? $t('export.exporting') : startLabel }}
          </Button>
        </template>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
