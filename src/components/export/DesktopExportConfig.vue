<script setup lang="ts">
import { Monitor, MonitorCog } from '@lucide/vue'

import type { DesktopConfigErrors } from '~/features/export/useWebExportDialog'
import type { PcPackaging, PcTarget, PcWindowConfig } from '~/services/export-manager'

interface Props {
  disabled?: boolean
  errors: DesktopConfigErrors
  installerTargets: PcTarget[]
}

defineProps<Props>()
const { t } = useI18n()
const id = useId()

const targets = defineModel<PcTarget[]>('targets', { required: true })
const packaging = defineModel<PcPackaging>('packaging', { required: true })
const windowConfig = defineModel<PcWindowConfig>('windowConfig', { required: true })
type SizeKey = 'width' | 'height' | 'minWidth' | 'minHeight'

const platformOptions = computed<{ label: string, system: string, value: PcTarget }[]>(() => [
  { label: t('export.desktopConfig.targets.windowsX64'), system: 'Windows', value: 'windows-x64' },
  { label: t('export.desktopConfig.targets.macosX64'), system: 'macOS', value: 'macos-x64' },
  { label: t('export.desktopConfig.targets.macosArm64'), system: 'macOS', value: 'macos-arm64' },
  { label: t('export.desktopConfig.targets.linuxX64'), system: 'Linux', value: 'linux-x64' },
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

    <div class="gap-2 grid">
      <span class="text-sm font-medium">{{ $t('export.desktopConfig.format') }}</span>
      <div class="flex gap-4">
        <label class="text-sm flex gap-2 items-center">
          <input type="radio" name="desktop-format" :checked="packaging.type === 'portable'" :disabled="disabled" @change="packaging = { type: 'portable' }">
          {{ $t('export.desktopConfig.portable') }}
        </label>
        <label class="text-sm flex gap-2 items-center">
          <input type="radio" name="desktop-format" :checked="packaging.type === 'installer'" :disabled="disabled" @change="packaging = { type: 'installer', version: '1.0.0', publisher: '' }">
          {{ $t('export.desktopConfig.installer') }}
        </label>
      </div>
      <div v-if="packaging.type === 'installer'" class="gap-3 grid grid-cols-2">
        <div class="text-xs gap-1 grid content-start">
          <label :for="`${id}-version`" class="text-muted-foreground">{{ $t('export.desktopConfig.version') }}</label>
          <Input
            :id="`${id}-version`"
            v-model="packaging.version"
            :disabled="disabled"
            placeholder="1.0.0"
            required
            :aria-invalid="!!errors.version"
            :aria-describedby="errors.version ? `${id}-version-error` : undefined"
            :class="{ 'border-destructive focus-visible:ring-destructive': errors.version }"
          />
          <p v-if="errors.version" :id="`${id}-version-error`" class="text-destructive" aria-live="polite">
            {{ errors.version }}
          </p>
        </div>
        <div class="text-xs gap-1 grid content-start">
          <label :for="`${id}-publisher`" class="text-muted-foreground">{{ $t('export.desktopConfig.publisher') }}</label>
          <Input
            :id="`${id}-publisher`"
            v-model="packaging.publisher"
            :disabled="disabled"
            required
            :aria-invalid="!!errors.publisher"
            :aria-describedby="errors.publisher ? `${id}-publisher-error` : undefined"
            :class="{ 'border-destructive focus-visible:ring-destructive': errors.publisher }"
          />
          <p v-if="errors.publisher" :id="`${id}-publisher-error`" class="text-destructive" aria-live="polite">
            {{ errors.publisher }}
          </p>
        </div>
      </div>
    </div>

    <div class="gap-2 grid grid-cols-2 sm:grid-cols-4" data-testid="desktop-target-grid">
      <label
        v-for="option in platformOptions"
        :key="option.value"
        class="text-sm px-2 py-3 border rounded-md flex flex-col gap-2 cursor-pointer transition-colors items-center relative has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/10 has-[:disabled]:opacity-50 has-[:disabled]:cursor-not-allowed focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
      >
        <Checkbox
          class="sr-only"
          :aria-label="option.label"
          :aria-describedby="packaging.type === 'installer' && !installerTargets.includes(option.value) ? `${id}-${option.value}-requirement` : undefined"
          :model-value="targets.includes(option.value)"
          :disabled="disabled || (packaging.type === 'installer' && !installerTargets.includes(option.value))"
          @update:model-value="updateTarget(option.value, $event === true)"
        />
        <span v-if="option.value === 'windows-x64'" class="i-simple-icons-windows text-foreground size-7" aria-hidden="true" />
        <span v-else-if="option.value === 'linux-x64'" class="i-simple-icons-linux text-foreground size-7" aria-hidden="true" />
        <span v-else class="i-simple-icons-apple text-foreground size-7" aria-hidden="true" />
        <span class="text-13px leading-tight text-center flex items-start justify-center">{{ option.label }}</span>
        <span v-if="packaging.type === 'installer' && !installerTargets.includes(option.value)" :id="`${id}-${option.value}-requirement`" class="text-xs text-muted-foreground text-center">
          {{ $t('export.desktopConfig.installerSystemRequired', { system: option.system }) }}
        </span>
      </label>
    </div>
    <p v-if="errors.targets" class="text-xs text-destructive" role="status">
      {{ errors.targets }}
    </p>

    <p class="text-xs text-muted-foreground">
      {{ $t('export.desktopConfig.steamUnsupported') }}
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
          <Input :model-value="windowConfig.width" :disabled="disabled" min="1" type="number" @update:model-value="updateSize('width', $event)" />
        </label>
        <label class="text-xs text-muted-foreground gap-1 grid">
          {{ $t('export.desktopConfig.height') }}
          <Input :model-value="windowConfig.height" :disabled="disabled" min="1" type="number" @update:model-value="updateSize('height', $event)" />
        </label>
        <label class="text-xs text-muted-foreground gap-1 grid">
          {{ $t('export.desktopConfig.minWidth') }}
          <Input :model-value="windowConfig.minWidth" :disabled="disabled" min="1" type="number" @update:model-value="updateSize('minWidth', $event)" />
        </label>
        <label class="text-xs text-muted-foreground gap-1 grid">
          {{ $t('export.desktopConfig.minHeight') }}
          <Input :model-value="windowConfig.minHeight" :disabled="disabled" min="1" type="number" @update:model-value="updateSize('minHeight', $event)" />
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
