<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import { Info, Settings } from 'lucide-vue-next'

import { github } from '~build/git'

import webgalCraftTextSvg from '/webgal-craft-text.svg?raw'

const modalStore = useModalStore()
</script>

<template>
  <header class="border-b bg-white dark:bg-gray-950">
    <div class="mx-auto px-4 container flex h-16 items-center lg:px-8 sm:px-6">
      <div
        class="mr-4 flex gap-2 items-center" :class="{ 'cursor-pointer': github }"
        @click="github && openUrl(github)"
      >
        <img src="/webgal-craft-logo.svg" class="size-10" alt="WebGAL Craft logo">
        <!-- eslint-disable-next-line vue/no-v-html -->
        <span class="text-gray-700 h-5 w-auto inline-block dark:text-gray-100" aria-hidden="true" v-html="webgalCraftTextSvg" />
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
