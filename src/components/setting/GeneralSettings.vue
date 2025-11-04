<script setup lang="ts">
import * as z from 'zod'

import { FormField } from '~/components/ui/form'

const { t } = useI18n()

const themeOptions = $computed(() => [
  { value: 'light', label: t('settings.general.theme.options.light') },
  { value: 'dark', label: t('settings.general.theme.options.dark') },
  { value: 'system', label: t('settings.general.followSystem') },
] as const)

const languageOptions = $computed(() => [
  { label: t('settings.general.followSystem'), value: 'system' },
  { label: '简体中文', value: 'zh-Hans' },
  { label: '繁體中文', value: 'zh-Hant' },
  { label: 'English', value: 'en' },
  { label: '日本語', value: 'ja' },
] as const)

const GeneralSettingsStore = useGeneralSettingsStore()

type ThemeValue = (typeof themeOptions)[number]['value']
type LanguageValue = (typeof languageOptions)[number]['value']

const themeValues = themeOptions.map(op => op.value) as [ThemeValue]
const languageValues = languageOptions.map(op => op.value) as [LanguageValue]

const validationSchema = $computed(() => z.object({
  theme: z.enum(themeValues),
  language: z.enum(languageValues),
  openLastProject: z.boolean(),
  autoInstallUpdates: z.boolean(),
}))

useSettingsForm({
  store: GeneralSettingsStore,
  validationSchema,
  immediateFields: ['theme', 'language'],
})
</script>

<template>
  <form class="space-y-5">
    <FormField v-slot="{ componentField }" type="radio" name="theme">
      <FormItem class="flex flex-col gap-2 space-y-0">
        <FormLabel>{{ $t('settings.general.theme.label') }}</FormLabel>
        <RadioGroup class="flex flex-wrap gap-8" v-bind="componentField">
          <FormItem v-for="themeOp in themeOptions" :key="themeOp.value">
            <FormLabel class="[&:has([data-state=checked])>div]:border-primary">
              <FormControl>
                <RadioGroupItem :value="themeOp.value" class="sr-only" />
              </FormControl>
              <ThemeStyleMap :theme="themeOp.value" />
              <span class="text-xs text-muted-foreground font-normal p-2 text-center w-full block">{{ themeOp.label }}</span>
            </FormLabel>
          </FormItem>
        </RadioGroup>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="language">
      <FormItem class="flex flex-row items-center justify-between space-y-0">
        <FormLabel>{{ $t('settings.general.language.label') }}</FormLabel>
        <Select v-bind="componentField">
          <FormControl>
            <SelectTrigger class="text-xs h-8 w-40 shadow-none">
              <SelectValue :placeholder="$t('settings.general.language.placeholder')" />
            </SelectTrigger>
          </FormControl>
          <SelectContent>
            <SelectGroup class="p-0">
              <SelectItem v-for="option in languageOptions" :key="option.value" :value="option.value" class="text-xs">
                {{ option.label }}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ value, handleChange }" name="openLastProject">
      <FormItem class="flex flex-row gap-2 max-w-120 items-center justify-between space-y-0">
        <div class="flex flex-col gap-1">
          <FormLabel>
            {{ $t('settings.general.openLastProject.label') }}
          </FormLabel>
          <FormDescription class="text-xs">
            {{ $t('settings.general.openLastProject.description') }}
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

    <FormField v-slot="{ value, handleChange }" name="autoInstallUpdates">
      <FormItem class="flex flex-row gap-2 max-w-120 items-center justify-between space-y-0">
        <div class="flex flex-col gap-1">
          <FormLabel>
            {{ $t('settings.general.autoInstallUpdates.label') }}
          </FormLabel>
          <FormDescription class="text-xs">
            {{ $t('settings.general.autoInstallUpdates.description') }}
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
