<script setup lang="ts">
import { Monitor, MonitorCog } from '@lucide/vue'

import type { PcTarget, PcWindowConfig } from '~/services/export-manager'

interface Props {
  disabled?: boolean
}

defineProps<Props>()
const { t } = useI18n()

const targets = defineModel<PcTarget[]>('targets', { required: true })
const windowConfig = defineModel<PcWindowConfig>('windowConfig', { required: true })
type SizeKey = 'width' | 'height' | 'minWidth' | 'minHeight'

const platformOptions = computed<{ label: string, value: PcTarget }[]>(() => [
  { label: t('export.desktopConfig.targets.windowsX64'), value: 'windows-x64' },
  { label: t('export.desktopConfig.targets.macosX64'), value: 'macos-x64' },
  { label: t('export.desktopConfig.targets.macosArm64'), value: 'macos-arm64' },
  { label: t('export.desktopConfig.targets.linuxX64'), value: 'linux-x64' },
])

function updateTarget(target: PcTarget, selected: boolean): void {
  targets.value = selected
    ? [...targets.value, target]
    : targets.value.filter(value => value !== target)
}

function updateSize(key: SizeKey, value: unknown): void {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return
  }
  const size = Math.max(1, Math.round(parsed))
  const next = { ...windowConfig.value }
  if (key === 'width' || key === 'minWidth') {
    if (key === 'width') {
      next.width = size
      next.minWidth = Math.min(next.minWidth, size)
    } else {
      next.minWidth = Math.min(size, next.width)
    }
    windowConfig.value = next
    return
  }
  if (key === 'height') {
    next.height = size
    next.minHeight = Math.min(next.minHeight, size)
  } else {
    next.minHeight = Math.min(size, next.height)
  }
  windowConfig.value = next
}
</script>

<template>
  <section class="flex flex-col gap-4" aria-labelledby="desktop-export-config-title">
    <div class="flex gap-2 items-center">
      <Monitor class="text-muted-foreground size-4" aria-hidden="true" />
      <h3 id="desktop-export-config-title" class="text-sm font-medium">
        {{ $t('export.desktopConfig.title') }}
      </h3>
    </div>

    <div class="gap-2 grid grid-cols-2 sm:grid-cols-4" data-testid="desktop-target-grid">
      <label
        v-for="option in platformOptions"
        :key="option.value"
        class="text-sm px-2 py-3 border rounded-md gap-2 grid grid-rows-[2rem_1.5rem] cursor-pointer transition-colors items-center justify-items-center relative has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/50 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
      >
        <Checkbox
          class="sr-only"
          :model-value="targets.includes(option.value)"
          :disabled="disabled"
          @update:model-value="updateTarget(option.value, $event === true)"
        />
        <span v-if="option.value === 'windows-x64'" class="i-simple-icons-windows text-foreground size-7" aria-hidden="true" />
        <span v-else-if="option.value === 'linux-x64'" class="i-simple-icons-linux text-foreground size-7" aria-hidden="true" />
        <span v-else class="i-simple-icons-apple text-foreground size-7" aria-hidden="true" />
        <span class="text-13px leading-tight text-center flex items-start justify-center">{{ option.label }}</span>
      </label>
    </div>
    <p v-if="targets.length === 0" class="text-xs text-destructive">
      {{ $t('export.desktopConfig.targetRequired') }}
    </p>

    <div class="p-3 border rounded-md flex flex-col gap-3">
      <div class="flex gap-2 items-center">
        <MonitorCog class="text-muted-foreground size-4" aria-hidden="true" />
        <h4 class="text-sm font-medium">
          {{ $t('export.desktopConfig.window') }}
        </h4>
      </div>
      <div class="gap-3 grid grid-cols-2 sm:grid-cols-4">
        <label class="text-xs text-muted-foreground gap-1 grid">
          {{ $t('export.desktopConfig.width') }}
          <Input :model-value="windowConfig.width" class="h-8 shadow-none" :disabled="disabled" min="1" type="number" @update:model-value="updateSize('width', $event)" />
        </label>
        <label class="text-xs text-muted-foreground gap-1 grid">
          {{ $t('export.desktopConfig.height') }}
          <Input :model-value="windowConfig.height" class="h-8 shadow-none" :disabled="disabled" min="1" type="number" @update:model-value="updateSize('height', $event)" />
        </label>
        <label class="text-xs text-muted-foreground gap-1 grid">
          {{ $t('export.desktopConfig.minWidth') }}
          <Input :model-value="windowConfig.minWidth" class="h-8 shadow-none" :disabled="disabled" min="1" type="number" @update:model-value="updateSize('minWidth', $event)" />
        </label>
        <label class="text-xs text-muted-foreground gap-1 grid">
          {{ $t('export.desktopConfig.minHeight') }}
          <Input :model-value="windowConfig.minHeight" class="h-8 shadow-none" :disabled="disabled" min="1" type="number" @update:model-value="updateSize('minHeight', $event)" />
        </label>
      </div>
      <div class="flex flex-wrap gap-x-6 gap-y-3">
        <label class="text-sm flex gap-2 items-center">
          <Switch v-model="windowConfig.fullScreen" :disabled="disabled" />
          {{ $t('export.desktopConfig.fullScreen') }}
        </label>
        <label class="text-sm flex gap-2 items-center">
          <Switch v-model="windowConfig.resizable" :disabled="disabled" />
          {{ $t('export.desktopConfig.resizable') }}
        </label>
      </div>
    </div>
  </section>
</template>
