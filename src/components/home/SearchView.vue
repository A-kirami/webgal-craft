<script setup lang="ts">
import { Grid, List, Search } from '@lucide/vue'

import { resolveHomeTabDefinition } from '~/features/home/home-tabs'
import { usePreferenceStore } from '~/stores/preference'
import { useWorkspaceStore } from '~/stores/workspace'
import { resolveI18nLike } from '~/utils/i18n-like'

const { t } = useI18n()
const preferenceStore = usePreferenceStore()
const workspaceStore = useWorkspaceStore()

const searchPlaceholder = computed(() => resolveI18nLike(
  resolveHomeTabDefinition(workspaceStore.activeTab).searchPlaceholder,
  t,
))

const updateSearch = useDebounceFn((value: string | number) => {
  workspaceStore.searchQuery = String(value)
}, 300)
</script>

<template>
  <div class="mt-4 flex items-center justify-between">
    <div class="max-w-sm w-full relative">
      <Search class="text-muted-foreground h-4 w-4 left-2.5 top-2.5 absolute" />
      <Input
        type="search"
        :placeholder="searchPlaceholder"
        class="pl-8 bg-background w-full shadow-none"
        :model-value="workspaceStore.searchQuery"
        @update:model-value="updateSearch"
      />
    </div>
    <div class="flex gap-1.5 items-center">
      <Button
        :variant="preferenceStore.viewMode === 'grid' ? 'default' : 'ghost'"
        size="icon"
        @click="preferenceStore.viewMode = 'grid'"
      >
        <Grid class="h-4 w-4" />
        <span class="sr-only">{{ $t('common.view.grid') }}</span>
      </Button>
      <Button
        :variant="preferenceStore.viewMode === 'list' ? 'default' : 'ghost'"
        size="icon"
        @click="preferenceStore.viewMode = 'list'"
      >
        <List class="h-4 w-4" />
        <span class="sr-only">{{ $t('common.view.list') }}</span>
      </Button>
    </div>
  </div>
</template>
