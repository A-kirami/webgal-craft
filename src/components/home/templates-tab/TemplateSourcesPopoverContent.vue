<script setup lang="ts">
import { Folder } from '@lucide/vue'

import type { TemplateGroupSourceItem } from '~/features/home/templates-tab/template-groups'

defineProps<{
  sources: TemplateGroupSourceItem[]
}>()

const emit = defineEmits<{
  openSourceFolder: [source: TemplateGroupSourceItem]
}>()

function resolveSourceLabel(source: TemplateGroupSourceItem): string {
  if (source.kind === 'standalone') {
    return source.name
  }
  return source.engineVersion
    ? `${source.engineName} ${source.engineVersion}`
    : source.engineName
}
</script>

<template>
  <div class="p-0 flex flex-col gap-1 min-w-0">
    <div
      v-for="source in sources"
      :key="source.kind === 'standalone' ? source.templateId : source.engineId"
      class="rounded-md flex items-center justify-between"
    >
      <div class="min-w-0">
        <p class="text-13px font-medium ml-1 truncate">
          {{ resolveSourceLabel(source) }}
        </p>
      </div>
      <div class="flex shrink-0 gap-1 items-center">
        <Button
          :aria-label="$t('home.templates.actions.openTemplateFolder')"
          variant="ghost"
          size="icon"
          class="size-6"
          @click="emit('openSourceFolder', source)"
        >
          <Folder class="size-3.5" />
        </Button>
      </div>
    </div>
  </div>
</template>
