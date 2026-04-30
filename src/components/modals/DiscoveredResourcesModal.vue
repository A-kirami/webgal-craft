<script setup lang="ts">
import { Box, Scroll } from '@lucide/vue'

import { compareEngineVersions } from '~/domain/engine/version'
import { usePreviewRuntimeStore } from '~/stores/preview-runtime'

import type { DiscoveredResource } from '~/features/home/discovered-resource'
import type { AssetThumbnailOptions } from '~/services/platform/asset-url'

type ResourceType = 'games' | 'engines' | 'templates'

interface EngineGroup {
  engineId: string
  name: string
  icon?: string
  representative: DiscoveredResource
  versions: DiscoveredResource[]
}

let open = $(defineModel<boolean>('open'))

const props = defineProps<{
  type: ResourceType
  resources: DiscoveredResource[]
  onImport?: (paths: string[]) => void
}>()

const { t } = useI18n()

let selectedPaths = $ref(new Set(props.resources.map(r => r.path)))
const previewRuntimeStore = usePreviewRuntimeStore()

const DISCOVERED_RESOURCE_ICON_THUMBNAIL: AssetThumbnailOptions = {
  width: 64,
  height: 64,
  resizeMode: 'contain',
}

const isEnginesType = $computed(() => props.type === 'engines')

const engineGroups = $computed<EngineGroup[]>(() => {
  if (!isEnginesType) {
    return []
  }

  const groupsMap = new Map<string, EngineGroup>()
  for (const resource of props.resources) {
    const groupKey = resource.engineId ?? resource.name
    let group = groupsMap.get(groupKey)
    if (!group) {
      group = {
        engineId: groupKey,
        name: resource.name,
        icon: resource.icon,
        representative: resource,
        versions: [],
      }
      groupsMap.set(groupKey, group)
    }
    group.versions.push(resource)
  }

  for (const group of groupsMap.values()) {
    group.versions.sort((a, b) => compareEngineVersions(a.version, b.version))
    const representative = group.versions[0] ?? group.representative
    group.representative = representative
    group.name = representative.name
    group.icon = representative.icon
  }

  return [...groupsMap.values()]
})

function toggleSelection(path: string) {
  const next = new Set(selectedPaths)
  if (next.has(path)) {
    next.delete(path)
  } else {
    next.add(path)
  }
  selectedPaths = next
}

function toggleAll() {
  selectedPaths = selectedPaths.size === props.resources.length ? new Set() : new Set(props.resources.map(r => r.path))
}

function getGroupSelectionState(group: EngineGroup): 'all' | 'partial' | 'none' {
  const selectedCount = group.versions.filter(v => selectedPaths.has(v.path)).length
  if (selectedCount === 0) {
    return 'none'
  }
  if (selectedCount === group.versions.length) {
    return 'all'
  }
  return 'partial'
}

function toggleGroup(group: EngineGroup) {
  const next = new Set(selectedPaths)
  const shouldDeselect = getGroupSelectionState(group) === 'all'
  for (const version of group.versions) {
    if (shouldDeselect) {
      next.delete(version.path)
    } else {
      next.add(version.path)
    }
  }
  selectedPaths = next
}

function handleImport() {
  open = false
  props.onImport?.([...selectedPaths])
}

function handleSkip() {
  open = false
}

const icon = $computed(() => props.type === 'games' ? Scroll : Box)
const isAllSelected = $computed(() => selectedPaths.size === props.resources.length)

const title = $computed(() => {
  switch (props.type) {
    case 'games': { return t('modals.discoveredResources.gamesTitle') }
    case 'engines': { return t('modals.discoveredResources.enginesTitle') }
    case 'templates': { return t('modals.discoveredResources.templatesTitle') }
    default: { return '' }
  }
})

const description = $computed(() => {
  if (props.type === 'engines') {
    return t('modals.discoveredResources.enginesDescription', {
      engineCount: engineGroups.length,
      versionCount: props.resources.length,
    })
  }
  const count = props.resources.length
  return props.type === 'games'
    ? t('modals.discoveredResources.gamesDescription', { count })
    : t('modals.discoveredResources.templatesDescription', { count })
})

watch(
  () => props.resources.map(resource => resource.path),
  (paths, previousPaths = []) => {
    const previousPathSet = new Set(previousPaths)
    const keptPaths = [...selectedPaths].filter(path => paths.includes(path))
    const addedPaths = paths.filter(path => !previousPathSet.has(path))
    selectedPaths = new Set([...keptPaths, ...addedPaths])

    if (props.type !== 'templates') {
      void previewRuntimeStore.ensureServeUrls(
        props.resources.map(resource => resource.previewSite ?? { projectPath: resource.path }),
      )
    }
  },
  { immediate: true },
)

function resolveResourceServeUrl(resource: DiscoveredResource): string | undefined {
  return props.type === 'templates' ? undefined : previewRuntimeStore.getServeUrl(resource.path)
}
</script>

<template>
  <Dialog ::open="open">
    <DialogScrollContent class="max-h-[80vh] max-w-2xl">
      <DialogHeader>
        <DialogTitle class="flex gap-2 items-center">
          {{ title }}
        </DialogTitle>
        <DialogDescription>
          {{ description }}
        </DialogDescription>
      </DialogHeader>

      <div class="py-2 space-y-3">
        <div class="flex items-center justify-between">
          <Button variant="ghost" size="sm" class="text-xs h-7" @click="toggleAll">
            {{ isAllSelected ? $t('modals.discoveredResources.deselectAll') : $t('modals.discoveredResources.selectAll') }}
          </Button>
          <span class="text-xs text-muted-foreground">
            {{ $t('modals.discoveredResources.selected', { count: selectedPaths.size, total: resources.length }) }}
          </span>
        </div>

        <div class="border rounded-lg max-h-96 overflow-y-auto">
          <template v-if="isEnginesType">
            <div
              v-for="(group, groupIndex) in engineGroups"
              :key="group.engineId"
              :class="{ 'border-t': groupIndex > 0 }"
            >
              <div class="px-3 py-2 bg-muted/40 flex gap-3 items-center">
                <AssetImage
                  v-if="group.icon"
                  :path="group.icon"
                  :root-path="group.representative.path"
                  :serve-url="resolveResourceServeUrl(group.representative)"
                  :alt="group.name"
                  fallback-image="/placeholder.svg"
                  :thumbnail="DISCOVERED_RESOURCE_ICON_THUMBNAIL"
                  class="rounded shrink-0 size-7"
                />
                <component :is="icon" v-else class="text-muted-foreground shrink-0 size-7" />
                <div class="flex flex-1 gap-2 min-w-0 items-baseline">
                  <h4 class="text-sm font-medium truncate">
                    {{ group.name }}
                  </h4>
                  <span class="text-xs text-muted-foreground shrink-0">
                    {{ $t('modals.discoveredResources.versionsCount', { count: group.versions.length }) }}
                  </span>
                </div>
                <button
                  type="button"
                  :aria-label="$t('modals.discoveredResources.toggleGroup', { name: group.name })"
                  class="text-xs text-muted-foreground px-1.5 rounded h-6 transition-colors hover:text-accent-foreground hover:bg-accent"
                  @click="toggleGroup(group)"
                >
                  {{ getGroupSelectionState(group) === 'all'
                    ? $t('modals.discoveredResources.deselectAll')
                    : $t('modals.discoveredResources.selectAll') }}
                </button>
              </div>

              <div class="px-3 py-2 pl-10 flex flex-wrap gap-1.5">
                <button
                  v-for="version in group.versions"
                  :key="version.path"
                  type="button"
                  :aria-pressed="selectedPaths.has(version.path)"
                  class="text-xs font-mono px-2 py-1 border rounded-md transition-colors"
                  :class="selectedPaths.has(version.path)
                    ? 'bg-primary/10 border-primary/40 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground'"
                  :title="version.path"
                  @click="toggleSelection(version.path)"
                >
                  {{ version.version ?? $t('common.unknown') }}
                </button>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="divide-y">
              <div
                v-for="resource in resources"
                :key="resource.path"
                class="p-3 flex cursor-pointer transition-colors items-center justify-between hover:bg-accent/50"
                :class="{ 'bg-accent': selectedPaths.has(resource.path) }"
                @click="toggleSelection(resource.path)"
              >
                <div class="flex flex-1 gap-3 min-w-0 items-center">
                  <Checkbox
                    :model-value="selectedPaths.has(resource.path)"
                    :aria-label="resource.name"
                    @click.stop="toggleSelection(resource.path)"
                  />
                  <AssetImage
                    v-if="resource.icon"
                    :path="resource.icon"
                    :root-path="resource.path"
                    :serve-url="resolveResourceServeUrl(resource)"
                    :alt="resource.name"
                    fallback-image="/placeholder.svg"
                    :thumbnail="DISCOVERED_RESOURCE_ICON_THUMBNAIL"
                    class="rounded shrink-0 size-10"
                  />
                  <component :is="icon" v-else class="text-muted-foreground shrink-0 size-10" />
                  <div class="flex-1 min-w-0">
                    <h4 class="font-medium truncate">
                      {{ resource.name }}
                    </h4>
                    <p class="text-xs text-muted-foreground truncate">
                      {{ resource.path }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="handleSkip">
          {{ $t('modals.discoveredResources.skip') }}
        </Button>
        <Button :disabled="selectedPaths.size === 0" @click="handleImport">
          {{ $t('modals.discoveredResources.import', { count: selectedPaths.size }) }}
        </Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>
