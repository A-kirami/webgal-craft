<script setup lang="ts">
import { useForm } from 'vee-validate'
import * as z from 'zod'

import { FormField } from '~/components/ui/form'

const PreviewSettingsStore = usePreviewSettingsStore()

const validationSchema = z.object({
  enableLivePreview: z.boolean(),
  enableFastPreview: z.boolean(),
})

const { handleSubmit, values } = useForm({
  validationSchema,
  initialValues: PreviewSettingsStore.$state,
})

const onSubmit = handleSubmit((values) => {
  PreviewSettingsStore.$patch(values)
})

watchDebounced(
  values,
  () => {
    void onSubmit()
  },
  { debounce: 300, maxWait: 600 },
)
</script>

<template>
  <form class="space-y-5">
    <FormField v-slot="{ value, handleChange }" name="enableLivePreview">
      <FormItem class="flex flex-row gap-2 max-w-120 items-center justify-between space-y-0">
        <div class="flex flex-col gap-1">
          <FormLabel>
            {{ $t('settings.preview.enableLivePreview.label') }}
          </FormLabel>
          <FormDescription class="text-xs">
            {{ $t('settings.preview.enableLivePreview.description') }}
          </FormDescription>
        </div>
        <FormControl>
          <Switch
            :model-value="value"
            @update:model-value="handleChange"
          />
        </FormControl>
      </FormItem>
    </FormField>

    <div v-show="values.enableLivePreview">
      <FormField v-slot="{ value, handleChange }" name="enableFastPreview">
        <FormItem class="flex flex-row gap-2 max-w-120 items-center justify-between space-y-0">
          <div class="flex flex-col gap-1">
            <FormLabel class="flex gap-1">
              {{ $t('settings.preview.enableFastPreview.label') }}
              <ExperimentalFeatureTooltip />
            </FormLabel>
            <FormDescription class="text-xs">
              {{ $t('settings.preview.enableFastPreview.description') }}
            </FormDescription>
          </div>
          <FormControl>
            <Switch
              :model-value="value"
              @update:model-value="handleChange"
            />
          </FormControl>
        </FormItem>
      </FormField>
    </div>
  </form>
</template>
