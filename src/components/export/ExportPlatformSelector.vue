<script setup lang="ts">
import { Check, Globe2, Monitor, Smartphone } from '@lucide/vue'

interface Props {
  selected: boolean
  disabled?: boolean
}

defineProps<Props>()
const emit = defineEmits<{
  toggle: []
}>()
</script>

<template>
  <div class="flex flex-col gap-2">
    <button
      type="button"
      class="p-3 text-left border rounded-md flex gap-3 transition-colors items-center relative disabled:opacity-60 disabled:cursor-not-allowed"
      :class="selected ? 'border-primary bg-accent/50' : 'hover:bg-accent/40'"
      :disabled="disabled"
      :aria-pressed="selected"
      @click="emit('toggle')"
    >
      <Globe2 class="shrink-0 size-5" aria-hidden="true" />
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium">
          {{ $t('export.platformWeb') }}
        </div>
        <div class="text-xs text-muted-foreground">
          {{ $t('export.platformWebDescription') }}
        </div>
      </div>
      <Check
        class="text-primary shrink-0 size-4 transition-opacity"
        :class="selected ? 'opacity-100' : 'opacity-0'"
        aria-hidden="true"
      />
    </button>

    <button
      type="button"
      class="p-3 text-left border rounded-md flex gap-3 items-center relative disabled:opacity-50 disabled:cursor-not-allowed"
      disabled
    >
      <Monitor class="shrink-0 size-5" aria-hidden="true" />
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium">
          {{ $t('export.platformDesktop') }}
        </div>
        <div class="text-xs text-muted-foreground">
          {{ $t('export.platformDesktopDescription') }}
        </div>
      </div>
      <Badge variant="secondary" class="shrink-0">
        {{ $t('export.comingSoon') }}
      </Badge>
    </button>

    <button
      type="button"
      class="p-3 text-left border rounded-md flex gap-3 items-center relative disabled:opacity-50 disabled:cursor-not-allowed"
      disabled
    >
      <Smartphone class="shrink-0 size-5" aria-hidden="true" />
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium">
          {{ $t('export.platformAndroid') }}
        </div>
        <div class="text-xs text-muted-foreground">
          {{ $t('export.platformAndroidDescription') }}
        </div>
      </div>
      <Badge variant="secondary" class="shrink-0">
        {{ $t('export.comingSoon') }}
      </Badge>
    </button>
  </div>
</template>
