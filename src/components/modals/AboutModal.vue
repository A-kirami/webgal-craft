<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import { Bug, Code, Dot, House, Tag } from 'lucide-vue-next'

import { getVersion } from '~/utils/metadata'

import { github } from '~build/git'

const open = defineModel<boolean>('open')

const version = getVersion()

function handleVersionClick() {
  if (version.link) {
    openUrl(version.link)
  }
}
</script>

<template>
  <Dialog ::open="open">
    <DialogContent class="sm:max-w-[480px]">
      <div class="mt-4 flex flex-col gap-4 items-center">
        <img src="/webgal-craft-logo.svg" alt="WebGAL Craft Logo" class="size-20">
        <div class="text-center space-y-2">
          <DialogTitle class="text-2xl font-bold">
            {{ $t('modals.about.appName') }}
          </DialogTitle>
          <DialogDescription class="text-sm text-muted-foreground">
            {{ $t('modals.about.appDescription') }}
          </DialogDescription>
        </div>
        <button
          :class="[
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-mono text-sm font-semibold transition-all',
            version.link
              ? 'text-primary bg-primary/10 hover:bg-primary/20 hover:scale-105'
              : 'text-muted-foreground bg-muted/50 cursor-default',
          ]"
          @click="handleVersionClick"
        >
          <Tag class="size-3.5" :stroke-width="2.5" />
          <span>{{ version.name }}</span>
        </button>
      </div>

      <div class="flex gap-1 justify-center">
        <button
          class="group text-muted-foreground rounded flex gap-1.5 transition-colors items-center hover:text-foreground"
          @click="openUrl('')"
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
          @click="github && openUrl(github + '/issues')"
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
