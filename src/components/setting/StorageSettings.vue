<script setup lang="ts">
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import * as z from 'zod'

import { FormField } from '~/components/ui/form'

const { t } = useI18n()
const StorageSettingsStore = useStorageSettingsStore()

const validationSchema = z.object({
  gameSavePath: z.string(),
  engineSavePath: z.string(),
})

const { setFieldValue } = useSettingsForm({
  store: StorageSettingsStore,
  validationSchema,
})

async function handleSelectFolder(
  fieldName: 'gameSavePath' | 'engineSavePath',
  title: string,
) {
  const currentPath = StorageSettingsStore[fieldName] || undefined
  const selected = await openDialog({
    title,
    directory: true,
    multiple: false,
    defaultPath: currentPath,
  })

  if (selected) {
    setFieldValue(fieldName, selected, false)
  }
}

async function handleSelectGameFolder() {
  await handleSelectFolder('gameSavePath', t('settings.storage.gamePath.title'))
}

async function handleSelectEngineFolder() {
  await handleSelectFolder('engineSavePath', t('settings.storage.enginePath.title'))
}
</script>

<template>
  <form class="space-y-5">
    <FormField v-slot="{ componentField }" name="gameSavePath">
      <FormItem class="flex flex-col gap-2 space-y-0">
        <FormLabel>{{ $t('settings.storage.gamePath.label') }}</FormLabel>
        <div class="flex gap-2">
          <FormControl>
            <Input
              v-bind="componentField"
              class="text-xs bg-accent flex-1 h-8 shadow-none cursor-default!"
              disabled
            />
          </FormControl>
          <Button
            variant="outline"
            type="button"
            class="text-xs font-normal h-8 w-auto shadow-none"
            @click="handleSelectGameFolder"
          >
            {{ $t('settings.storage.browse') }}
          </Button>
        </div>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="engineSavePath">
      <FormItem class="flex flex-col gap-2 space-y-0">
        <FormLabel>{{ $t('settings.storage.enginePath.label') }}</FormLabel>
        <div class="flex gap-2">
          <FormControl>
            <Input
              v-bind="componentField"
              class="text-xs bg-accent flex-1 h-8 shadow-none cursor-default!"
              disabled
            />
          </FormControl>
          <Button
            variant="outline"
            type="button"
            class="text-xs font-normal h-8 w-auto shadow-none"
            @click="handleSelectEngineFolder"
          >
            {{ $t('settings.storage.browse') }}
          </Button>
        </div>
        <FormMessage />
      </FormItem>
    </FormField>
  </form>
</template>
