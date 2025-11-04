<script setup lang="ts">
import * as z from 'zod'

import { FormField } from '~/components/ui/form'

const EditSettingsStore = useEditSettingsStore()

const validationSchema = z.object({
  fontFamily: z.string(),
  fontSize: z.number().min(8).max(48),
  wordWrap: z.boolean(),
  minimap: z.boolean(),
  autoSave: z.boolean(),
})

useSettingsForm({
  store: EditSettingsStore,
  validationSchema,
})
</script>

<template>
  <form class="space-y-5">
    <FormField v-slot="{ componentField }" name="fontFamily">
      <FormItem class="flex flex-row items-center justify-between space-y-0">
        <FormLabel>{{ $t('settings.edit.fontFamily.label') }}</FormLabel>
        <FormControl>
          <Input
            type="text"
            v-bind="componentField"
            class="text-xs h-8 w-64 shadow-none"
            :placeholder="$t('settings.edit.fontFamily.placeholder')"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ value, handleChange }" name="fontSize">
      <FormItem class="flex flex-row items-center justify-between space-y-0">
        <FormLabel>{{ $t('settings.edit.fontSize.label') }}</FormLabel>
        <FormControl>
          <NumberField
            :model-value="value ?? null"
            :min="8"
            :max="48"
            :invert-wheel-change="true"
            @update:model-value="(newValue) => {
              const numValue = typeof newValue === 'string'
                ? (newValue === '' ? null : Number(newValue))
                : newValue;
              // 确保传递数字类型，无效值时保持当前值不变
              if (numValue !== null && !isNaN(numValue) && typeof numValue === 'number') {
                handleChange(numValue);
              }
            }"
          >
            <NumberFieldContent class="w-26">
              <NumberFieldInput class="h-8 shadow-none" />
              <NumberFieldIncrement class="p-2" />
              <NumberFieldDecrement class="p-2" />
            </NumberFieldContent>
          </NumberField>
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ value, handleChange }" name="wordWrap">
      <FormItem class="flex flex-row gap-2 max-w-120 items-center justify-between space-y-0">
        <div class="flex flex-col gap-1">
          <FormLabel>
            {{ $t('settings.edit.wordWrap.label') }}
          </FormLabel>
          <FormDescription class="text-xs">
            {{ $t('settings.edit.wordWrap.description') }}
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

    <FormField v-slot="{ value, handleChange }" name="minimap">
      <FormItem class="flex flex-row gap-2 max-w-120 items-center justify-between space-y-0">
        <div class="flex flex-col gap-1">
          <FormLabel>
            {{ $t('settings.edit.minimap.label') }}
          </FormLabel>
          <FormDescription class="text-xs">
            {{ $t('settings.edit.minimap.description') }}
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

    <FormField v-slot="{ value, handleChange }" name="autoSave">
      <FormItem class="flex flex-row gap-2 max-w-120 items-center justify-between space-y-0">
        <div class="flex flex-col gap-1">
          <FormLabel>
            {{ $t('settings.edit.autoSave.label') }}
          </FormLabel>
          <FormDescription class="text-xs">
            {{ $t('settings.edit.autoSave.description') }}
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
  </form>
</template>
