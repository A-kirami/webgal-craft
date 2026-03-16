<script setup lang="ts">
import * as z from 'zod'

import { FormField } from '~/components/ui/form'

const editSettingsStore = useEditSettingsStore()

const validationSchema = z.object({
  fontFamily: z.string(),
  fontSize: z.number().min(8).max(48),
  wordWrap: z.boolean(),
  minimap: z.boolean(),
  autoSave: z.boolean(),
  enablePreviewTab: z.boolean(),
  autoApplyEffectEditorChanges: z.boolean(),
  effectEditorSide: z.enum(['left', 'right']),
  collapseStatementsOnSidebarOpen: z.boolean(),
  showSidebarAssetPreview: z.boolean(),
  commandInsertPosition: z.enum(['afterCursor', 'end']),
})

useSettingsForm({
  store: editSettingsStore,
  validationSchema,
})

// NumberField 可能传入字符串，需要过滤无效值只传递合法数字
function handleFontSizeChange(handleChange: (val: number) => void) {
  return (newValue: string | number) => {
    const numValue = typeof newValue === 'string'
      ? (newValue === '' ? undefined : Number(newValue))
      : newValue
    if (numValue !== undefined && !Number.isNaN(numValue) && typeof numValue === 'number') {
      handleChange(numValue)
    }
  }
}
</script>

<template>
  <form class="space-y-5">
    <h3 class="text-xs text-muted-foreground tracking-wide font-medium uppercase">
      {{ $t('settings.edit.general') }}
    </h3>

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

    <FormField v-slot="{ value, handleChange }" name="enablePreviewTab">
      <FormItem class="flex flex-row gap-2 max-w-120 items-center justify-between space-y-0">
        <div class="flex flex-col gap-1">
          <FormLabel>
            {{ $t('settings.edit.enablePreviewTab.label') }}
          </FormLabel>
          <FormDescription class="text-xs">
            {{ $t('settings.edit.enablePreviewTab.description') }}
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

    <FormField v-slot="{ value, handleChange }" name="autoApplyEffectEditorChanges">
      <FormItem class="flex flex-row gap-2 max-w-120 items-center justify-between space-y-0">
        <div class="flex flex-col gap-1">
          <FormLabel>
            {{ $t('settings.edit.autoApplyEffectEditorChanges.label') }}
          </FormLabel>
          <FormDescription class="text-xs">
            {{ $t('settings.edit.autoApplyEffectEditorChanges.description') }}
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

    <FormField v-slot="{ value, handleChange }" name="commandInsertPosition">
      <FormItem class="flex flex-row gap-2 max-w-120 items-center justify-between space-y-0">
        <div class="flex flex-col gap-1">
          <FormLabel>
            {{ $t('settings.edit.commandInsertPosition.label') }}
          </FormLabel>
          <FormDescription class="text-xs">
            {{ $t('settings.edit.commandInsertPosition.description') }}
          </FormDescription>
        </div>
        <FormControl>
          <Select :model-value="value" @update:model-value="handleChange">
            <SelectTrigger class="h-8 w-28 shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="afterCursor">
                {{ $t('settings.edit.commandInsertPosition.afterCursor') }}
              </SelectItem>
              <SelectItem value="end">
                {{ $t('settings.edit.commandInsertPosition.end') }}
              </SelectItem>
            </SelectContent>
          </Select>
        </FormControl>
      </FormItem>
    </FormField>

    <FormField v-slot="{ value, handleChange }" name="effectEditorSide">
      <FormItem class="flex flex-row gap-2 max-w-120 items-center justify-between space-y-0">
        <div class="flex flex-col gap-1">
          <FormLabel>
            {{ $t('settings.edit.effectEditorSide.label') }}
          </FormLabel>
          <FormDescription class="text-xs">
            {{ $t('settings.edit.effectEditorSide.description') }}
          </FormDescription>
        </div>
        <FormControl>
          <Select :model-value="value" @update:model-value="handleChange">
            <SelectTrigger class="h-8 w-28 shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="left">
                {{ $t('settings.edit.effectEditorSide.left') }}
              </SelectItem>
              <SelectItem value="right">
                {{ $t('settings.edit.effectEditorSide.right') }}
              </SelectItem>
            </SelectContent>
          </Select>
        </FormControl>
      </FormItem>
    </FormField>

    <h3 class="text-xs text-muted-foreground tracking-wide font-medium mt-8 uppercase">
      {{ $t('settings.edit.textEditor') }}
    </h3>
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
            :model-value="value"
            :min="8"
            :max="48"
            :invert-wheel-change="true"
            @update:model-value="handleFontSizeChange(handleChange)"
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

    <h3 class="text-xs text-muted-foreground tracking-wide font-medium mt-8 uppercase">
      {{ $t('settings.edit.visualEditor') }}
    </h3>

    <FormField v-slot="{ value, handleChange }" name="collapseStatementsOnSidebarOpen">
      <FormItem class="flex flex-row gap-2 max-w-120 items-center justify-between space-y-0">
        <div class="flex flex-col gap-1">
          <FormLabel>
            {{ $t('settings.edit.collapseStatementsOnSidebarOpen.label') }}
          </FormLabel>
          <FormDescription class="text-xs">
            {{ $t('settings.edit.collapseStatementsOnSidebarOpen.description') }}
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

    <FormField v-slot="{ value, handleChange }" name="showSidebarAssetPreview">
      <FormItem class="flex flex-row gap-2 max-w-120 items-center justify-between space-y-0">
        <div class="flex flex-col gap-1">
          <FormLabel>
            {{ $t('settings.edit.showSidebarAssetPreview.label') }}
          </FormLabel>
          <FormDescription class="text-xs">
            {{ $t('settings.edit.showSidebarAssetPreview.description') }}
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
