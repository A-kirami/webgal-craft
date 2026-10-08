<script setup lang="ts">
import { Info, Settings } from '@lucide/vue'
import { openUrl } from '@tauri-apps/plugin-opener'

import { useModalStore } from '~/stores/modal'

import webgalCraftTextSvg from '/webgal-craft-text.svg?raw'

const modalStore = useModalStore()
</script>

<template>
  <header class="border-b bg-card">
    <div class="mx-auto px-4 container flex h-16 items-center lg:px-8 sm:px-6">
      <div
        class="mr-4 flex gap-2 cursor-pointer items-center"
        @click="openUrl('https://webgalcraft.com')"
      >
        <img src="/webgal-craft-logo.svg" class="size-10" alt="WebGAL Craft logo">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <span class="text-foreground h-5 w-auto inline-block" aria-hidden="true" v-html="webgalCraftTextSvg" />
      </div>
      <nav class="ml-auto flex gap-2 items-center">
        <Button variant="ghost" size="icon" @click="modalStore.open('AboutModal')">
          <span class="sr-only">{{ $t('home.header.about') }}</span>
          <Info />
        </Button>
        <Button variant="ghost" size="icon" @click="modalStore.open('SettingsModal')">
          <span class="sr-only">{{ $t('common.settings') }}</span>
          <Settings />
        </Button>
      </nav>
    </div>
  </header>
</template>
