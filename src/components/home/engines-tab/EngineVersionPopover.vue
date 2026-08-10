<script setup lang="ts">
import { Download, ExternalLink, LoaderCircle, Trash2, TriangleAlert } from '@lucide/vue'

import { compareEngineVersions } from '~/domain/engine/version'

import type { Engine } from '~/database/model'
import type { EngineGroupCollectionItem } from '~/features/home/home-collection-items'

interface Props {
  canDelete?: boolean
  group: EngineGroupCollectionItem
}

const { canDelete = true, group } = defineProps<Props>()

const emit = defineEmits<{
  deleteEngine: [engine: Engine]
  downloadVersion: [version: string]
  openVersionRelease: [releaseUrl: string]
}>()

interface VersionItem {
  downloadable: boolean
  engine?: Engine
  id: string
  releaseUrl?: string
  version?: string
}

const releaseUrlByVersion = computed(() => new Map(
  (group.remote?.releases ?? []).map(release => [release.version, release.releaseUrl]),
))

const versionItems = computed<VersionItem[]>(() => {
  const installedVersions = new Set(group.engines
    .map(item => item.engine.version)
    .filter((version): version is string => version !== undefined))
  const items: VersionItem[] = group.engines.map(item => ({
    downloadable: false,
    engine: item.engine,
    id: item.engine.id,
    releaseUrl: item.engine.version
      ? releaseUrlByVersion.value.get(item.engine.version)
      : undefined,
    version: item.engine.version,
  }))

  for (const release of group.remote?.releases ?? []) {
    if (!installedVersions.has(release.version)) {
      items.push({
        downloadable: true,
        id: `remote-${release.version}`,
        releaseUrl: release.releaseUrl,
        version: release.version,
      })
    }
  }

  return items.toSorted((left, right) => compareEngineVersions(left.version, right.version))
})

const latestVersion = computed(() => versionItems.value[0]?.version)
</script>

<template>
  <TooltipProvider>
    <div class="p-0 flex flex-col gap-1 min-w-0">
      <div
        v-if="group.remote?.status === 'loading'"
        class="text-xs text-muted-foreground px-1 py-2 flex gap-2 items-center"
      >
        <LoaderCircle class="size-3.5 animate-spin" />
        {{ $t('home.engines.official.checking') }}
      </div>
      <div
        v-else-if="group.remote?.status === 'error'"
        class="text-xs text-destructive px-1 py-2 flex gap-2 items-center"
      >
        <TriangleAlert class="size-3.5" />
        {{ $t('home.engines.official.loadFailed') }}
      </div>
      <div
        v-for="item in versionItems"
        :key="item.id"
        class="rounded-md flex items-center justify-between"
      >
        <div class="min-w-0">
          <div class="ml-1 flex flex-wrap gap-1.5 items-center">
            <span class="text-13px font-medium">
              {{ item.version ?? $t('common.unknown') }}
            </span>
            <Badge v-if="latestVersion && latestVersion === item.version" variant="secondary">
              {{ $t('engine.latestBadge') }}
            </Badge>
            <Badge v-if="item.engine && item.engine.availability !== 'available'" variant="outline">
              <TriangleAlert class="size-3" />
              {{ $t('engine.unavailable') }}
            </Badge>
          </div>
        </div>

        <div class="flex gap-0.5 items-center">
          <Tooltip v-if="item.releaseUrl">
            <TooltipTrigger as-child>
              <Button
                :aria-label="$t('common.openReleasePage')"
                variant="ghost"
                size="icon"
                class="size-6"
                @click="emit('openVersionRelease', item.releaseUrl)"
              >
                <ExternalLink class="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{{ $t('common.openReleasePage') }}</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip v-if="item.downloadable">
            <TooltipTrigger as-child>
              <Button
                :aria-label="$t('home.engines.official.download')"
                :disabled="group.remote?.status !== 'ready'"
                variant="ghost"
                size="icon"
                class="size-6"
                @click="item.version && emit('downloadVersion', item.version)"
              >
                <Download class="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{{ $t('home.engines.official.download') }}</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip v-else-if="canDelete && item.engine">
            <TooltipTrigger as-child>
              <Button
                :aria-label="$t('engine.deleteVersion')"
                variant="ghost"
                size="icon"
                class="text-destructive size-6 hover:text-destructive-foreground hover:bg-destructive"
                @click="emit('deleteEngine', item.engine)"
              >
                <Trash2 class="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{{ $t('engine.deleteVersion') }}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  </TooltipProvider>
</template>
