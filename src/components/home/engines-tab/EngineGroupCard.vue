<script setup lang="ts">
import { Download, EllipsisVertical, ExternalLink, Folder, LoaderCircle, RefreshCw, ShieldCheck, Star, Trash2, TriangleAlert } from '@lucide/vue'

import { isOfficialWebgalEngine } from '~/domain/engine/official-release'
import { compareEngineVersions } from '~/domain/engine/version'

import type { Engine } from '~/database/model'
import type { EngineGroupCollectionItem } from '~/features/home/home-collection-items'
import type { AssetThumbnailOptions } from '~/services/platform/asset-url'
import type { MenuItem } from '~/types/menu-item'

interface Props {
  group: EngineGroupCollectionItem
  progress?: number
  viewMode: 'grid' | 'list'
}

const {
  group,
  progress,
  viewMode,
} = defineProps<Props>()
const { t } = useI18n()

const emit = defineEmits<{
  deleteEngine: [engine: Engine]
  deleteGroup: [engineId: string]
  downloadVersion: [version: string]
  openGroupFolder: [group: EngineGroupCollectionItem]
  openRelease: []
  openVersionRelease: [releaseUrl: string]
  retryRemote: []
  setDefaultEngine: [engineId: string | undefined]
}>()

const GRID_ICON_THUMBNAIL: AssetThumbnailOptions = { width: 120, height: 120, resizeMode: 'cover' }
const LIST_ICON_THUMBNAIL: AssetThumbnailOptions = { width: 80, height: 80, resizeMode: 'cover' }

const isActiveImporting = $computed(() => group.isImporting)
const isOfficial = $computed(() => isOfficialWebgalEngine(group.engineId))
const remoteVersions = $computed(() => group.remote?.releases.map(release => release.version) ?? [])
const installedVersions = $computed(() => new Set(group.engines
  .map(item => item.engine.version)
  .filter((version): version is string => version !== undefined)))
const latestInstalledVersion = $computed(() => [...installedVersions].toSorted(compareEngineVersions)[0])
const downloadableVersions = $computed(() => remoteVersions.filter(version => !installedVersions.has(version)))
const latestRemoteVersion = $computed(() => remoteVersions.toSorted(compareEngineVersions)[0])
const remoteDownloadVersion = $computed(() => {
  if (latestRemoteVersion && !installedVersions.has(latestRemoteVersion)) {
    return latestRemoteVersion
  }
})

const remoteAction = $computed(() => {
  if (!group.remote) {
    return
  }
  if (group.remote.status === 'loading') {
    return { disabled: true, icon: LoaderCircle, label: t('home.engines.official.checking'), kind: 'none' as const }
  }
  if (group.remote.status === 'installing') {
    return { disabled: true, icon: LoaderCircle, label: t('home.engines.official.installing'), kind: 'none' as const }
  }
  if (group.remote.status === 'error') {
    return { disabled: false, icon: RefreshCw, label: t('home.engines.official.retry'), kind: 'retry' as const }
  }
  if (!remoteDownloadVersion) {
    return
  }
  return {
    disabled: false,
    icon: group.hasAvailableVersion ? RefreshCw : Download,
    label: group.hasAvailableVersion
      ? t('home.engines.official.update')
      : t('home.engines.official.install'),
    kind: 'download' as const,
  }
})

const versionSummary = $computed(() => {
  if (isActiveImporting) {
    return t('home.engines.importing')
  }

  const summaries = [
    ...(latestInstalledVersion ? [latestInstalledVersion] : []),
    group.versionCount > 0
      ? t('engine.installedVersions', { count: group.versionCount })
      : t('engine.notInstalled'),
  ]
  if (downloadableVersions.length > 0) {
    summaries.push(t('engine.totalVersions', { count: group.versionCount + downloadableVersions.length }))
  }

  return summaries.join(' · ')
})

function handleRemoteAction(): void {
  if (remoteAction?.kind === 'retry') {
    emit('retryRemote')
  } else if (remoteAction?.kind === 'download' && remoteDownloadVersion) {
    emit('downloadVersion', remoteDownloadVersion)
  }
}

const menuItems = $computed<MenuItem[]>(() => {
  const items: MenuItem[] = [
    {
      icon: Star,
      label: group.isDefault ? t('engine.unsetDefaultEngine') : t('engine.setDefaultEngine'),
      onClick: () => emit('setDefaultEngine', group.isDefault ? undefined : group.engineId),
      disabled: !group.hasAvailableVersion && !group.isDefault,
    },
    ...(group.engines.length > 0
      ? [{
          icon: Folder,
          label: t('common.openFolder'),
          onClick: () => emit('openGroupFolder', group),
        }]
      : []),
    ...(isOfficial
      ? [{
          icon: ExternalLink,
          label: t('common.openReleasePage'),
          onClick: () => emit('openRelease'),
        }]
      : []),
  ]

  if (!isActiveImporting && group.engines.length > 0) {
    items.push({
      icon: Trash2,
      label: t('engine.uninstallAllVersions'),
      onClick: () => emit('deleteGroup', group.engineId),
      class: 'text-destructive focus:text-destructive-foreground focus:bg-destructive',
    })
  }

  return items
})
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <Card
        v-if="viewMode === 'grid'"
        :data-availability="group.isUnavailable ? 'unavailable' : 'available'"
        class="rounded-lg shadow-sm relative overflow-hidden"
        :class="{
          'cursor-wait': isActiveImporting,
          'ring-1 ring-destructive/40 border-destructive/30 bg-destructive/[0.03]': group.isUnavailable,
        }"
      >
        <CardContent class="p-3 flex flex-col gap-1">
          <div class="flex gap-4 items-start justify-between">
            <div class="flex flex-1 gap-4 min-w-0 items-stretch">
              <div class="rounded-md shrink-0 size-12 overflow-hidden">
                <AssetImage
                  v-if="group.representativeItem"
                  :path="group.representativeItem.engine.previewAssets.icon.path"
                  :root-path="group.representativeItem.engine.path"
                  :serve-url="group.representativeItem.serveUrl"
                  :alt="$t('home.engines.engineIcon', { name: group.name })"
                  :cache-version="group.representativeItem.engine.previewAssets.icon.cacheVersion"
                  object-fit="cover"
                  fallback-image="/placeholder.svg"
                  :thumbnail="GRID_ICON_THUMBNAIL"
                  class="h-full w-full"
                />
                <div v-else class="bg-muted flex h-full w-full items-center justify-center" />
              </div>

              <div class="flex flex-1 flex-col min-w-0 justify-between">
                <div class="flex flex-wrap gap-2 items-center">
                  <h4 class="font-medium">
                    {{ group.name }}
                  </h4>
                  <Badge v-if="isOfficial" variant="secondary" class="text-emerald-700 bg-emerald-50 gap-1 dark:text-emerald-400 dark:bg-emerald-950/40 hover:bg-emerald-50 dark:hover:bg-emerald-950/40">
                    <ShieldCheck aria-hidden="true" class="size-3.5" />
                    {{ $t('home.engines.official.badge') }}
                  </Badge>
                  <Badge v-if="group.isDefault" variant="secondary">
                    {{ $t('engine.defaultEngine') }}
                  </Badge>
                  <Badge v-if="group.isUnavailable" variant="destructive">
                    <TriangleAlert class="size-3" />
                    {{ $t('home.unavailableBadge') }}
                  </Badge>
                </div>

                <Popover>
                  <PopoverTrigger as-child>
                    <Button variant="ghost" class="text-[13px] text-muted-foreground font-normal px-1.5 py-0 text-left h-auto w-fit justify-start -ml-1.5">
                      <span>
                        {{ versionSummary }}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" class="px-3 py-2 w-56" @open-auto-focus.prevent>
                    <EngineVersionPopover
                      :group="group"
                      :can-delete="!isActiveImporting"
                      @delete-engine="engine => emit('deleteEngine', engine)"
                      @download-version="version => emit('downloadVersion', version)"
                      @open-version-release="releaseUrl => emit('openVersionRelease', releaseUrl)"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div class="flex gap-1 items-center">
              <Button
                v-if="isOfficial && remoteAction"
                :disabled="remoteAction.disabled"
                variant="outline"
                class="shrink-0 gap-1.5 h-7 shadow-none [&_svg]:size-3.5"
                size="sm"
                @click="handleRemoteAction"
              >
                <component
                  :is="remoteAction.icon"
                  :class="{ 'animate-spin': group.remote?.status === 'loading' || group.remote?.status === 'installing' }"
                />
                {{ remoteAction.label }}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button :aria-label="$t('common.more')" variant="ghost" size="icon" class="h-8 w-8">
                    <EllipsisVertical class="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="text-13px w-44">
                  <DropdownMenuItem
                    v-for="(item, index) in menuItems"
                    :key="index"
                    :class="item.class"
                    :disabled="item.disabled"
                    @click="item.onClick"
                  >
                    <component :is="item.icon" class="mr-2 size-3.5" />
                    {{ item.label }}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <p v-if="group.summary" class="text-13px text-muted-foreground line-clamp-2">
            {{ group.summary }}
          </p>
        </CardContent>
        <Progress
          v-if="progress !== undefined"
          :model-value="progress"
          class="rounded-none h-1 inset-x-0 bottom-0 absolute"
        />
      </Card>

      <div
        v-else
        :data-availability="group.isUnavailable ? 'unavailable' : 'available'"
        class="p-3 flex transition-colors duration-200 items-center justify-between relative hover:bg-primary/5 dark:hover:bg-primary/10"
        :class="{
          'cursor-wait': isActiveImporting,
          'bg-destructive/[0.04] hover:bg-destructive/[0.08] dark:hover:bg-destructive/[0.12]': group.isUnavailable,
        }"
      >
        <div class="flex flex-1 gap-3 min-w-0 items-center">
          <div class="rounded-md flex shrink-0 h-10 w-10 items-center justify-center overflow-hidden">
            <AssetImage
              v-if="group.representativeItem"
              :path="group.representativeItem.engine.previewAssets.icon.path"
              :root-path="group.representativeItem.engine.path"
              :serve-url="group.representativeItem.serveUrl"
              :alt="$t('home.engines.engineIcon', { name: group.name })"
              :cache-version="group.representativeItem.engine.previewAssets.icon.cacheVersion"
              object-fit="cover"
              fallback-image="/placeholder.svg"
              :thumbnail="LIST_ICON_THUMBNAIL"
              class="h-full w-full"
            />
            <div v-else class="bg-muted flex h-full w-full items-center justify-center" />
          </div>

          <div class="flex flex-1 flex-col min-w-0 justify-center">
            <div class="flex flex-wrap gap-2 items-center">
              <h3 class="font-medium">
                {{ group.name }}
              </h3>
              <Badge v-if="isOfficial" variant="secondary" class="text-emerald-700 bg-emerald-50 gap-1 dark:text-emerald-400 dark:bg-emerald-950/40 hover:bg-emerald-50 dark:hover:bg-emerald-950/40">
                <ShieldCheck aria-hidden="true" class="size-3.5" />
                {{ $t('home.engines.official.badge') }}
              </Badge>
              <Badge v-if="group.isDefault" variant="secondary">
                {{ $t('engine.defaultEngine') }}
              </Badge>
              <Badge v-if="group.isUnavailable" variant="destructive">
                <TriangleAlert class="size-3" />
                {{ $t('home.unavailableBadge') }}
              </Badge>
            </div>
            <p v-if="group.summary" class="text-xs text-muted-foreground line-clamp-1">
              {{ group.summary }}
            </p>
          </div>
        </div>

        <div class="flex shrink-0 gap-3 items-center">
          <Popover>
            <PopoverTrigger as-child>
              <Button variant="ghost" class="text-[13px] text-muted-foreground font-normal p-0 h-auto">
                {{ versionSummary }}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" class="p-2 w-56" @open-auto-focus.prevent>
              <EngineVersionPopover
                :group="group"
                :can-delete="!isActiveImporting"
                @delete-engine="engine => emit('deleteEngine', engine)"
                @download-version="version => emit('downloadVersion', version)"
                @open-version-release="releaseUrl => emit('openVersionRelease', releaseUrl)"
              />
            </PopoverContent>
          </Popover>

          <Button
            v-if="isOfficial && remoteAction"
            :disabled="remoteAction.disabled"
            variant="outline"
            class="shrink-0 gap-1.5"
            size="sm"
            @click="handleRemoteAction"
          >
            <component
              :is="remoteAction.icon"
              class="size-4"
              :class="{ 'animate-spin': group.remote?.status === 'loading' || group.remote?.status === 'installing' }"
            />
            {{ remoteAction.label }}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button :aria-label="$t('common.more')" variant="ghost" size="icon" class="h-8 w-8">
                <EllipsisVertical class="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-44">
              <DropdownMenuItem
                v-for="(item, index) in menuItems"
                :key="index"
                :class="item.class"
                :disabled="item.disabled"
                @click="item.onClick"
              >
                <component :is="item.icon" class="mr-2 size-3.5" />
                {{ item.label }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Progress
          v-if="progress !== undefined"
          :model-value="progress"
          class="rounded-none h-0.75 inset-x-0 bottom-0 absolute"
        />
      </div>
    </ContextMenuTrigger>

    <ContextMenuContent class="w-44" @close-auto-focus.prevent>
      <ContextMenuItem
        v-for="(item, index) in menuItems"
        :key="index"
        :class="item.class"
        :disabled="item.disabled"
        @click="item.onClick"
      >
        <component :is="item.icon" class="mr-2 size-3.5" />
        {{ item.label }}
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
