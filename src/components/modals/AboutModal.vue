<script setup lang="ts">
import {
  Bug,
  Code,
  Dot,
  House,
  RefreshCw,
  ScrollText,
  Tag,
} from '@lucide/vue'
import { openUrl } from '@tauri-apps/plugin-opener'

import {
  collectAboutEnvironmentInfo,
  createBugReportUrl,
  formatAboutEnvironmentInfo,
} from '~/features/about/feedback'
import { useAppUpdateController } from '~/features/app-update/useAppUpdateController'
import { isDesktopRuntime } from '~/services/platform/runtime'
import { getVersion } from '~/utils/metadata'

import { github } from '~build/git'

const open = defineModel<boolean>('open')

const version = getVersion()
const appUpdateController = useAppUpdateController()
const canCheckForUpdate = isDesktopRuntime()
const environmentInfo = collectAboutEnvironmentInfo(version.name)
const environmentInfoText = formatAboutEnvironmentInfo(environmentInfo)
const repositoryUrl = github || 'https://github.com/A-kirami/webgal-craft'
const bugReportUrl = createBugReportUrl(repositoryUrl, environmentInfo)

function handleVersionClick() {
  if (version.link) {
    openUrl(version.link)
  }
}

function handleCheckForUpdate(): void {
  void appUpdateController.checkForUpdate('manual')
}

function handleOpenReleaseList(): void {
  void appUpdateController.openReleasePage()
}

function isEditableCopyTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])') !== null
}

function handleCopy(event: ClipboardEvent): void {
  if (
    event.defaultPrevented
    || isEditableCopyTarget(event.target)
    || globalThis.getSelection()?.isCollapsed === false
    || !event.clipboardData
  ) {
    return
  }

  event.clipboardData.setData('text/plain', environmentInfoText)
  event.preventDefault()
}

function handleOpenBugReport(): void {
  void openUrl(bugReportUrl)
}
</script>

<template>
  <Dialog ::open="open">
    <DialogContent class="sm:max-w-[480px]" @copy="handleCopy">
      <div class="mt-4 flex flex-col gap-4 items-center">
        <img src="/webgal-craft-logo.svg" alt="WebGAL Craft Logo" class="size-20">
        <div class="text-center space-y-2">
          <DialogTitle class="text-2xl font-bold">
            {{ $t('app.name') }}
          </DialogTitle>
          <DialogDescription class="text-sm text-muted-foreground">
            {{ $t('app.description') }}
          </DialogDescription>
        </div>
        <div class="flex gap-2 items-center">
          <button
            :class="[
              'text-sm font-mono font-semibold px-3 py-1.5 rounded-md bg-muted inline-flex gap-1.5 transition-all items-center',
              version.link ? 'text-primary' : 'text-muted-foreground cursor-default',
            ]"
            @click="handleVersionClick"
          >
            <Tag class="size-3.5" :stroke-width="2.5" aria-hidden="true" />
            <span>{{ version.name }}</span>
          </button>
          <Button
            v-if="canCheckForUpdate"
            size="icon"
            variant="ghost"
            class="text-muted-foreground bg-muted size-8"
            :title="$t('appUpdate.action.checkForUpdate')"
            :aria-label="$t('appUpdate.action.checkForUpdate')"
            @click="handleCheckForUpdate"
          >
            <RefreshCw class="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div class="flex flex-wrap gap-x-1 gap-y-2 justify-center">
        <button
          class="group text-muted-foreground rounded flex gap-1.5 transition-colors items-center hover:text-foreground"
          @click="openUrl('https://webgalcraft.com')"
        >
          <House class="size-3.5" />
          <span class="text-xs">{{ $t('modals.about.homepage') }}</span>
        </button>

        <Dot class="text-muted-foreground/50" :stroke-width="2" />

        <button
          class="group text-muted-foreground rounded flex gap-1.5 transition-colors items-center hover:text-foreground"
          @click="github && openUrl(github)"
        >
          <Code class="size-3.5" />
          <span class="text-xs">{{ $t('modals.about.sourceCode') }}</span>
        </button>

        <Dot class="text-muted-foreground/50" :stroke-width="2" />

        <button
          class="group text-muted-foreground rounded flex gap-1.5 transition-colors items-center hover:text-foreground"
          @click="handleOpenReleaseList"
        >
          <ScrollText class="size-3.5" />
          <span class="text-xs">{{ $t('modals.about.changelog') }}</span>
        </button>

        <Dot class="text-muted-foreground/50" :stroke-width="2" />

        <button
          class="group text-muted-foreground rounded flex gap-1.5 transition-colors items-center hover:text-foreground"
          @click="handleOpenBugReport"
        >
          <Bug class="size-3.5" />
          <span class="text-xs">{{ $t('modals.about.issues') }}</span>
        </button>
      </div>

      <DialogFooter class="flex gap-2 flex-col!">
        <Separator />
        <div class="text-xs text-muted-foreground/70 flex items-center justify-between">
          <button
            class="transition-colors hover:text-muted-foreground"
            @click="openUrl('https://github.com/A-kirami')"
          >
            {{ $t('modals.about.copyright') }}
          </button>
          <button
            class="transition-colors hover:text-muted-foreground"
            @click="github && openUrl(github + '/blob/main/LICENSE')"
          >
            {{ $t('modals.about.license') }}
          </button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
