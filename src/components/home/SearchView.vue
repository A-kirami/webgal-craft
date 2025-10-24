<script setup lang="ts">
import { Grid, List, Search } from 'lucide-vue-next'

const { t } = useI18n()
const preferenceStore = usePreferenceStore()
const workspaceStore = useWorkspaceStore()

// 根据当前标签页返回搜索提示文本
const searchPlaceholder = computed(() =>
  workspaceStore.activeTab === 'recent'
    ? t('home.search.placeholder.recent')
    : t('home.search.placeholder.engines'),
)

// 使用防抖更新搜索值
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
        <span class="sr-only">{{ $t('home.search.view.grid') }}</span>
      </Button>
      <Button
        :variant="preferenceStore.viewMode === 'list' ? 'default' : 'ghost'"
        size="icon"
        @click="preferenceStore.viewMode = 'list'"
      >
        <List class="h-4 w-4" />
        <span class="sr-only">{{ $t('home.search.view.list') }}</span>
      </Button>
    </div>
  </div>
</template>
