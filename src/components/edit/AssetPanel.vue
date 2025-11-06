<script setup lang="ts">
import { Blend, Image, LayoutGrid, LayoutList, MicVocal, Minus, Music, Plus, Search, UserRound, Video } from 'lucide-vue-next'

const preferenceStore = usePreferenceStore()

let isSearchExpanded = $ref(false)

const { t } = useI18n()

const assetTabs = $computed(() => ({
  figure: {
    icon: UserRound,
    label: t('edit.assetPanel.tabs.figure'),
  },
  background: {
    icon: Image,
    label: t('edit.assetPanel.tabs.background'),
  },
  bgm: {
    icon: Music,
    label: t('edit.assetPanel.tabs.bgm'),
  },
  vocal: {
    icon: MicVocal,
    label: t('edit.assetPanel.tabs.vocal'),
  },
  video: {
    icon: Video,
    label: t('edit.assetPanel.tabs.video'),
  },
  animation: {
    icon: Blend,
    label: t('edit.assetPanel.tabs.animation'),
  },
}))

type AssetTabs = keyof typeof assetTabs
let activeTab = $ref<AssetTabs>('figure')

const assetPaths = $ref<Record<string, string>>({})

const currentPath = $computed({
  get: () => assetPaths[activeTab] || '',
  set: (val: string) => {
    assetPaths[activeTab] = val
  },
})

function toggleSearch() {
  isSearchExpanded = !isSearchExpanded
}

function handleZoomChange(delta: number) {
  const newZoom = preferenceStore.assetZoom[0] + delta
  if (newZoom >= 50 && newZoom <= 150) {
    preferenceStore.assetZoom[0] = newZoom
  }
}

const isMinZoom = $computed(() => preferenceStore.assetZoom[0] <= 50)
const isMaxZoom = $computed(() => preferenceStore.assetZoom[0] >= 150)
</script>

<template>
  <div class="rounded flex flex-col h-full divide-y">
    <Tabs v-model="activeTab" class="w-full">
      <TabsList class="py-1 border-b rounded-none bg-transparent @container grid grid-cols-6 h-auto w-full">
        <TabsTrigger
          v-for="(tab, key) in assetTabs"
          :key="key"
          :value="key"
          class="rounded relative hover:text-foreground data-[state=active]:bg-transparent hover:bg-accent after:h-0.5 after:content-empty data-[state=active]:shadow-none after:inset-x-0 after:bottom-0 after:absolute after:-mb-1 data-[state=active]:after:bg-primary data-[state=active]:hover:bg-accent"
        >
          <div class="flex gap-1 items-center justify-center">
            <component :is="tab.icon" class="shrink-0 size-4" />
            <span class="text-xs hidden @[450px]:block">{{ tab.label }}</span>
          </div>
        </TabsTrigger>
      </TabsList>
    </Tabs>
    <div class="px-3 py-1 flex gap-2 items-center justify-between">
      <AssetBreadcrumb :asset-type="activeTab" ::current-path="currentPath" />
      <div class="gap-2 inline-grid grid-flow-col items-center">
        <Input
          :placeholder="$t('edit.assetPanel.searchPlaceholder')"
          class="text-xs h-7 transition-all duration-300 ease-in-out"
          :class="[
            isSearchExpanded ? 'w-[200px] opacity-100 px-3' : 'w-0 opacity-0 px-0'
          ]"
        />
        <Button
          variant="outline"
          size="icon"
          class="size-7"
          @click="toggleSearch"
        >
          <Search />
        </Button>
      </div>
    </div>
    <KeepAlive>
      <AssetView :key="activeTab" class="flex-1" :asset-type="activeTab" ::current-path="currentPath" />
    </KeepAlive>
    <div class="px-2 py-0.75 bg-gray-50 @container flex items-center justify-between dark:bg-gray-900">
      <ToggleGroup
        v-model="preferenceStore.assetViewMode"
        type="single"
        class="border rounded gap-0"
      >
        <ToggleGroupItem
          value="grid"
          size="sm"
          class="p-0 rounded-sm size-6 min-w-auto data-[state=on]:bg-gray-200 dark:data-[state=on]:bg-gray-800"
        >
          <LayoutGrid class="size-3.5!" />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="list"
          size="sm"
          class="p-0 rounded-sm size-6 min-w-auto data-[state=on]:bg-gray-200 dark:data-[state=on]:bg-gray-800"
        >
          <LayoutList class="size-3.5!" />
        </ToggleGroupItem>
      </ToggleGroup>
      <div class="flex flex-1 gap-2 max-w-45 items-center justify-end">
        <Minus
          class="text-muted-foreground h-3.5 w-3.5"
          :class="{
            'opacity-50 cursor-not-allowed': isMinZoom,
            'cursor-pointer hover:text-foreground': !isMinZoom
          }"
          @click="!isMinZoom && handleZoomChange(-5)"
        />
        <Slider
          ::="preferenceStore.assetZoom"
          :min="50"
          :max="150"
          :step="5"
          class="flex-1 hidden @[320px]:flex"
        />
        <span class="text-xs text-center w-8 order-none @[320px]:order-1">
          {{ preferenceStore.assetZoom[0] }}%
        </span>
        <Plus
          class="text-muted-foreground h-3.5 w-3.5"
          :class="{
            'opacity-50 cursor-not-allowed': isMaxZoom,
            'cursor-pointer hover:text-foreground': !isMaxZoom
          }"
          @click="!isMaxZoom && handleZoomChange(5)"
        />
      </div>
    </div>
  </div>
</template>
