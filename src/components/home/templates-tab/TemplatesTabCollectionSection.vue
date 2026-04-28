<script setup lang="ts">
import { Box, Folder, Trash2 } from '@lucide/vue'

import { useTauriDropZone } from '~/composables/useTauriDropZone'

import type { TemplateCollectionItem } from '~/features/home/home-collection-items'
import type {
  StandaloneTemplateSourceItem,
  TemplateGroupSourceItem,
  TemplateGroupViewModel,
} from '~/features/home/templates-tab/template-groups'
import type { MenuItem } from '~/types/menu-item'

interface Props {
  items: TemplateCollectionItem[]
  getTemplateProgress: (group: TemplateGroupViewModel) => number
  hasTemplateProgress: (group: TemplateGroupViewModel) => boolean
  viewMode: 'grid' | 'list'
}

const {
  items,
  getTemplateProgress,
  hasTemplateProgress,
  viewMode,
} = defineProps<Props>()
const { t } = useI18n()

const emit = defineEmits<{
  deleteTemplate: [group: TemplateGroupViewModel]
  importClick: []
  openSourceFolder: [source: TemplateGroupSourceItem]
  drop: [paths: string[]]
}>()

const dropZoneGridRef = useTemplateRef<HTMLElement>('dropZoneGridRef')
const { isOverDropZone: isOverDropZoneGrid } = useTauriDropZone(dropZoneGridRef, paths => emit('drop', paths))

const dropZoneListRef = useTemplateRef<HTMLElement>('dropZoneListRef')
const { isOverDropZone: isOverDropZoneList } = useTauriDropZone(dropZoneListRef, paths => emit('drop', paths))

function resolveStandaloneSource(group: TemplateGroupViewModel): StandaloneTemplateSourceItem | undefined {
  return group.sources.find((source): source is StandaloneTemplateSourceItem => source.kind === 'standalone')
}

function getGroupMenuItems(item: TemplateCollectionItem): MenuItem[] {
  const menuItems: MenuItem[] = []
  const source = resolveStandaloneSource(item.templateGroup)
  if (source) {
    menuItems.push({
      icon: Folder,
      label: t('home.templates.actions.openTemplateFolder'),
      onClick: () => emit('openSourceFolder', source),
    })
  }
  if (item.templateGroup.sourceKind === 'standalone' && !hasTemplateProgress(item.templateGroup)) {
    menuItems.push({
      icon: Trash2,
      label: t('home.templates.deleteTemplate'),
      onClick: () => emit('deleteTemplate', item.templateGroup),
      class: 'text-destructive focus:text-destructive-foreground focus:bg-destructive',
    })
  }
  return menuItems
}

const menuItemsMap = $computed(() => {
  const map = new Map<string, MenuItem[]>()
  for (const item of items) {
    map.set(item.templateGroup.key, getGroupMenuItems(item))
  }
  return map
})

function getMenuItems(item: TemplateCollectionItem): MenuItem[] {
  return menuItemsMap.get(item.templateGroup.key) ?? []
}

function handleOpenSourceFolder(source: TemplateGroupSourceItem) {
  emit('openSourceFolder', source)
}
</script>

<template>
  <ScrollArea class="h-full min-h-0">
    <div v-if="viewMode === 'grid'" class="gap-4 grid grid-cols-1 lg:grid-cols-4 md:grid-cols-3">
      <TemplateGroupCard
        v-for="item in items"
        :key="item.templateGroup.key"
        :item="item"
        :view-mode="viewMode"
        :menu-items="getMenuItems(item)"
        :has-progress="hasTemplateProgress(item.templateGroup)"
        :progress="getTemplateProgress(item.templateGroup)"
        @open-source-folder="handleOpenSourceFolder"
      />

      <button
        ref="dropZoneGridRef"
        type="button"
        :aria-label="$t('home.templates.importTemplate')"
        class="p-3 border-1 border-gray-300 rounded-lg border-dashed bg-gray-50 flex gap-4 cursor-pointer shadow-none transition-colors items-center justify-center overflow-hidden dark:border-gray-700 hover:border-primary/40 dark:bg-gray-900 dark:hover:border-primary/60"
        :class="{ 'border-primary/40 bg-primary/5': isOverDropZoneGrid }"
        @click="emit('importClick')"
      >
        <div class="p-3 rounded-full bg-primary/10">
          <Box class="text-primary h-6 w-6" />
        </div>
        <div class="text-left">
          <p class="text-sm font-medium">
            {{ $t('home.templates.importTemplate') }}
          </p>
          <p class="text-xs text-muted-foreground mt-1">
            {{ $t('home.templates.importTemplateHint') }}
          </p>
        </div>
      </button>
    </div>

    <div v-else class="border rounded-lg overflow-hidden divide-y">
      <TemplateGroupCard
        v-for="item in items"
        :key="item.templateGroup.key"
        :item="item"
        :view-mode="viewMode"
        :menu-items="getMenuItems(item)"
        :has-progress="hasTemplateProgress(item.templateGroup)"
        :progress="getTemplateProgress(item.templateGroup)"
        @open-source-folder="handleOpenSourceFolder"
      />

      <button
        ref="dropZoneListRef"
        type="button"
        :aria-label="$t('home.templates.importTemplate')"
        class="p-3 bg-gray-50/50 flex w-full cursor-pointer transition-colors items-center justify-between dark:bg-gray-800/10 hover:bg-gray-100 dark:hover:bg-gray-800/20"
        :class="{ 'bg-primary/5': isOverDropZoneList }"
        @click="emit('importClick')"
      >
        <div class="flex gap-3 items-center">
          <div class="rounded-md bg-primary/10 flex h-10 w-10 items-center justify-center">
            <Box class="text-primary h-5 w-5" />
          </div>
          <div class="text-left">
            <p class="text-sm font-medium">
              {{ $t('home.templates.importTemplate') }}
            </p>
            <p class="text-xs text-muted-foreground mt-1">
              {{ $t('home.templates.importTemplateHint') }}
            </p>
          </div>
        </div>
      </button>
    </div>
  </ScrollArea>
</template>
