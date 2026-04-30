<script setup lang="ts">
import { Trash2, TriangleAlert } from '@lucide/vue'

import type { Engine } from '~/database/model'
import type { EngineGroupCollectionItem } from '~/features/home/home-collection-items'

interface Props {
  group: EngineGroupCollectionItem
}

defineProps<Props>()

const emit = defineEmits<{
  deleteEngine: [engine: Engine]
}>()
</script>

<template>
  <div class="p-0 flex flex-col gap-1 min-w-0">
    <div
      v-for="item in group.engines"
      :key="item.engine.id"
      class="rounded-md flex items-center justify-between"
    >
      <div class="min-w-0">
        <div class="ml-1 flex flex-wrap gap-1.5 items-center">
          <span class="text-13px font-medium">
            {{ item.engine.version ?? $t('common.unknown') }}
          </span>
          <Badge v-if="group.latestVersionLabel === item.engine.version" variant="secondary">
            {{ $t('engine.latestBadge') }}
          </Badge>
          <Badge v-if="item.engine.availability !== 'available'" variant="outline">
            <TriangleAlert class="mr-1 size-3" />
            {{ $t('engine.unavailable') }}
          </Badge>
        </div>
      </div>

      <Button
        :aria-label="$t('engine.deleteVersion')"
        variant="ghost"
        size="icon"
        class="text-destructive size-6 hover:text-destructive-foreground hover:bg-destructive"
        @click="emit('deleteEngine', item.engine)"
      >
        <Trash2 class="size-3.5" />
      </Button>
    </div>
  </div>
</template>
