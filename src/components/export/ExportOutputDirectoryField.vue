<script setup lang="ts">
interface Props {
  disabled?: boolean
  outputPreview?: string
  outputRoot?: string
}

defineProps<Props>()
const emit = defineEmits<{
  select: []
}>()
</script>

<template>
  <div class="flex flex-col gap-2">
    <Label for="web-export-output-root">{{ $t('export.outputDirectory') }}</Label>
    <div class="flex gap-2">
      <Input
        id="web-export-output-root"
        :model-value="outputRoot ?? ''"
        class="text-xs bg-accent flex-1 h-8 shadow-none cursor-default!"
        disabled
      />
      <Button
        type="button"
        variant="outline"
        class="text-xs font-normal h-8 w-auto shadow-none"
        :disabled="disabled"
        @click="emit('select')"
      >
        {{ $t('export.browse') }}
      </Button>
    </div>
    <p
      v-if="outputPreview"
      class="text-xs text-muted-foreground truncate"
      :title="outputPreview"
      aria-live="polite"
    >
      {{ $t('export.finalOutputPath') }}: {{ outputPreview }}
    </p>
    <p
      v-else
      class="text-xs text-muted-foreground"
      role="status"
    >
      {{ $t('export.selectDirectoryHint') }}
    </p>
  </div>
</template>
