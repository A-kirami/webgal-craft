<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import { CircleHelp, Settings } from 'lucide-vue-next'
import InlineSvg from 'vue-inline-svg'

import { github } from '~build/git'

const modalStore = useModalStore()
</script>

<template>
  <header class="border-b bg-white dark:bg-gray-950">
    <div class="mx-auto px-4 container flex h-16 items-center lg:px-8 sm:px-6">
      <div
        class="mr-4 flex gap-2 items-center" :class="{ 'cursor-pointer': github }"
        @click="github && openUrl(github)"
      >
        <InlineSvg src="/webgal-craft-logo.svg" class="size-10" alt="webgalcraft logo" />
        <InlineSvg src="/webgal-craft-text.svg" class="h-5 w-auto" alt="webgalcraft text" />
      </div>
      <nav class="ml-auto flex gap-2 items-center">
        <Button variant="ghost" size="icon" @click="modalStore.open('AboutModal')">
          <span class="sr-only">{{ $t('home.header.help') }}</span>
          <CircleHelp />
        </Button>
        <Button variant="ghost" size="icon" @click="modalStore.open('SettingsModal')">
          <span class="sr-only">{{ $t('home.header.settings') }}</span>
          <Settings />
        </Button>
      </nav>
    </div>
  </header>
</template>
