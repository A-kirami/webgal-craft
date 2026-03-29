<script setup lang="ts">
import { open as openDialog } from '@tauri-apps/plugin-dialog'

import { resolveI18nLike } from '~/utils/i18n-like'

import type { FolderPickerFieldDef } from '~/features/settings/schema'

interface Props {
  field: FolderPickerFieldDef
  value?: string
  handleChange: (event: Event | unknown, shouldValidate?: boolean) => void
  componentField?: object
}

const props = defineProps<Props>()

const { t } = useI18n()

async function handleSelectFolder() {
  const selected = await openDialog({
    title: resolveI18nLike(props.field.dialogTitle ?? props.field.label, t),
    directory: true,
    multiple: false,
    defaultPath: props.value || undefined,
  })

  if (selected) {
    props.handleChange(selected)
  }
}
</script>

<template>
  <FormItem class="flex flex-col gap-2 space-y-0">
    <div class="flex flex-col gap-1">
      <FormLabel class="flex gap-1">
        {{ resolveI18nLike(field.label, t) }}
        <ExperimentalFeatureTooltip v-if="field.experimental" />
      </FormLabel>
      <FormDescription v-if="field.description" class="text-xs">
        {{ resolveI18nLike(field.description, t) }}
      </FormDescription>
    </div>
    <div class="flex gap-2">
      <Input
        :model-value="value"
        class="text-xs bg-accent flex-1 h-8 shadow-none cursor-default!"
        disabled
      />
      <FormControl>
        <Button
          v-bind="componentField"
          variant="outline"
          type="button"
          class="text-xs font-normal h-8 w-auto shadow-none"
          @click="handleSelectFolder"
        >
          {{ resolveI18nLike(field.buttonLabel ?? ((translator) => translator('common.openFolder')), t) }}
        </Button>
      </FormControl>
    </div>
    <FormMessage />
  </FormItem>
</template>
