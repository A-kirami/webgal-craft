<script setup lang="ts">
import { desktopDirectoryPicker } from '~/features/resource-import/desktop-directory-picker'
import { isAndroidRuntime } from '~/services/platform/runtime'
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
const readonly = computed(() => props.field.readonlyOnAndroid === true && isAndroidRuntime())
const displayValue = computed(() => {
  if (readonly.value && props.field.androidDisplayValue) {
    return resolveI18nLike(props.field.androidDisplayValue, t)
  }
  return props.value
})

async function handleSelectFolder() {
  if (readonly.value) {
    return
  }

  const selected = await desktopDirectoryPicker.selectDirectory(
    resolveI18nLike(props.field.dialogTitle ?? props.field.label, t),
    props.value || undefined,
  )

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
        :model-value="displayValue"
        class="text-xs bg-accent flex-1 h-8 shadow-none cursor-default!"
        disabled
      />
      <FormControl v-if="!readonly">
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
