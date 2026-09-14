<script setup lang="ts">
import { X } from '@lucide/vue'
import { useFieldArray } from 'vee-validate'

import { FormField } from '~/components/ui/form'
import { AUDIO_EXTENSIONS } from '~/features/editor/command-registry/common-params'
import { createGameConfigKey, GAME_CONFIG_DEFAULT_LANGUAGES } from '~/features/modals/game-config/game-config-form'

import type { AbsPath } from '~/domain/path'
import type {
  GameConfigDefaultLanguage,
  GameConfigFormValues,
} from '~/features/modals/game-config/game-config-form'

interface Props {
  backgroundRootPath: AbsPath
  bgmRootPath: AbsPath
  gamePath: AbsPath
  serveUrl?: string
}

defineProps<Props>()

const DEFAULT_LANGUAGE_EMPTY_VALUE = '__runtime_fallback__'
const {
  fields: customConfigFields,
  push: pushCustomConfig,
  remove: removeCustomConfig,
} = useFieldArray<GameConfigFormValues['customConfig'][number]>('customConfig')

// 语言名固定用各语言自身的写法，不跟随界面语言翻译
/* eslint-disable camelcase -- 键是引擎 config.txt 的语言取值，不能改写成 camelCase */
const DEFAULT_LANGUAGE_LABELS: Record<GameConfigDefaultLanguage, string> = {
  zh_CN: '简体中文',
  zh_TW: '繁體中文',
  en: 'English',
  ja: '日本語',
  fr: 'Français',
  de: 'Deutsch',
  pt_BR: 'Português do Brasil',
  ko: '한국어',
}
/* eslint-enable camelcase */

const defaultLanguageOptions = GAME_CONFIG_DEFAULT_LANGUAGES.map(value => ({
  label: DEFAULT_LANGUAGE_LABELS[value],
  value,
}))

const SUPPORTED_DEFAULT_LANGUAGES: ReadonlySet<string> = new Set(GAME_CONFIG_DEFAULT_LANGUAGES)

function handleOptionalNumberChange(handleChange: (value: '' | number) => void, nextValue: string | number) {
  if (nextValue === '') {
    handleChange('')
    return
  }

  const parsedValue = typeof nextValue === 'number'
    ? nextValue
    : Number(nextValue)

  if (Number.isNaN(parsedValue)) {
    return
  }

  handleChange(parsedValue)
}

function applyGeneratedGameKey(handleChange: (value: string) => void) {
  handleChange(createGameConfigKey())
}

function handleSingleLineTextareaEnter(event: KeyboardEvent) {
  if (event.isComposing) {
    return
  }

  event.preventDefault()
}

function normalizeSingleLineText(value: string): string {
  return value.replaceAll(/\r\n?|\n/g, ' ')
}

function handleDescriptionChange(handleChange: (value: string) => void, nextValue: string | number) {
  handleChange(normalizeSingleLineText(String(nextValue)))
}

function handleTextInputChange(handleChange: (value: string) => void, nextValue: string | number) {
  handleChange(String(nextValue))
}

const customAddButtonContainerRef = $(useTemplateRef<HTMLDivElement>('customAddButtonContainerRef'))

async function handleAddCustomConfig() {
  pushCustomConfig({
    key: '',
    value: '',
  })

  await nextTick()
  focusCustomConfigKey(customConfigFields.value.length - 1)
  scrollCustomAddButtonIntoView()
}

function handleRemoveCustomConfig(index: number) {
  removeCustomConfig(index)
}

function focusCustomConfigKey(index: number) {
  const customKeyInput = document.querySelector<HTMLInputElement>(`#game-config-custom-key-${index}`)

  if (!customKeyInput) {
    return
  }

  customKeyInput.focus()
}

function scrollCustomAddButtonIntoView() {
  const addButton = customAddButtonContainerRef?.querySelector('[data-testid="game-config-custom-add"]')

  if (!(addButton instanceof HTMLElement)) {
    return
  }

  addButton.scrollIntoView({ block: 'nearest' })
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div data-testid="game-config-fields" class="gap-5 grid">
      <FormField
        v-slot="{ componentField }"
        name="gameName"
      >
        <FormItem class="flex flex-col gap-2">
          <div class="flex flex-col gap-1">
            <FormLabel for="game-config-game-name">
              {{ $t('modals.gameConfig.fields.gameName.label') }}
            </FormLabel>
            <FormDescription class="text-xs">
              {{ $t('modals.gameConfig.fields.gameName.description') }}
            </FormDescription>
          </div>
          <FormControl>
            <Input
              id="game-config-game-name"
              data-testid="game-config-game-name"
              v-bind="componentField"
              class="text-xs"
            />
          </FormControl>
          <FormMessage class="text-xs" />
        </FormItem>
      </FormField>

      <FormField
        v-slot="{ handleChange, value }"
        name="description"
      >
        <FormItem class="flex flex-col gap-2">
          <div class="flex flex-col gap-1">
            <FormLabel for="game-config-description">
              {{ $t('modals.gameConfig.fields.description.label') }}
            </FormLabel>
            <FormDescription class="text-xs">
              {{ $t('modals.gameConfig.fields.description.description') }}
            </FormDescription>
          </div>
          <FormControl>
            <Textarea
              id="game-config-description"
              data-testid="game-config-description"
              :model-value="typeof value === 'string' ? value : ''"
              class="text-xs py-1.5 min-h-16 resize-none"
              @keydown.enter="handleSingleLineTextareaEnter"
              @update:model-value="handleDescriptionChange(handleChange, $event)"
            />
          </FormControl>
        </FormItem>
      </FormField>

      <FormField
        v-slot="{ handleChange, value }"
        name="titleImg"
      >
        <FormItem class="flex flex-col gap-2">
          <div class="flex flex-col gap-1">
            <FormLabel>
              {{ $t('modals.gameConfig.fields.titleImg.label') }}
            </FormLabel>
            <FormDescription class="text-xs">
              {{ $t('modals.gameConfig.fields.titleImg.description') }}
            </FormDescription>
          </div>
          <FormControl>
            <TitleImgPicker
              :model-value="typeof value === 'string' ? value : ''"
              :background-root-path="backgroundRootPath"
              :game-path="gamePath"
              :serve-url="serveUrl"
              @update:model-value="handleChange"
            />
          </FormControl>
        </FormItem>
      </FormField>

      <FormField
        v-slot="{ componentField }"
        name="titleBgm"
      >
        <FormItem class="flex flex-col gap-2">
          <div class="flex flex-col gap-1">
            <FormLabel for="game-config-title-bgm">
              {{ $t('modals.gameConfig.fields.titleBgm.label') }}
            </FormLabel>
            <FormDescription class="text-xs">
              {{ $t('modals.gameConfig.fields.titleBgm.description') }}
            </FormDescription>
          </div>
          <FormControl>
            <FilePicker
              input-id="game-config-title-bgm"
              :model-value="String(componentField.modelValue ?? '')"
              :root-path="bgmRootPath"
              :extensions="AUDIO_EXTENSIONS"
              :popover-title="$t('modals.gameConfig.fields.titleBgm.pickerTitle')"
              history-scope-key="game-config-title-bgm"
              class="w-full [&_input]:text-xs"
              @update:model-value="componentField['onUpdate:modelValue']"
            />
          </FormControl>
        </FormItem>
      </FormField>

      <FormField
        v-slot="{ handleChange, value }"
        name="gameLogo"
      >
        <FormItem class="flex flex-col gap-2">
          <div class="flex gap-3 items-end justify-between">
            <div class="flex flex-col gap-1">
              <FormLabel>
                {{ $t('modals.gameConfig.fields.gameLogo.label') }}
              </FormLabel>
              <FormDescription class="text-xs">
                {{ $t('modals.gameConfig.fields.gameLogo.description') }}
              </FormDescription>
            </div>
            <span class="text-xs text-muted-foreground whitespace-nowrap">
              {{ $t('modals.gameConfig.gameLogo.count', { count: Array.isArray(value) ? value.length : 0 }) }}
            </span>
          </div>
          <FormControl>
            <GameLogoPicker
              :model-value="Array.isArray(value) ? value : []"
              :background-root-path="backgroundRootPath"
              :game-path="gamePath"
              :serve-url="serveUrl"
              @update:model-value="handleChange"
            />
          </FormControl>
        </FormItem>
      </FormField>
      <FormField
        v-slot="{ handleChange, value }"
        name="defaultLanguage"
      >
        <FormItem class="gap-x-2 gap-y-1 grid grid-cols-[1fr_auto] items-center">
          <div class="flex flex-col gap-1">
            <FormLabel>
              {{ $t('modals.gameConfig.fields.defaultLanguage.label') }}
            </FormLabel>
            <FormDescription class="text-xs">
              {{ $t('modals.gameConfig.fields.defaultLanguage.description') }}
            </FormDescription>
          </div>
          <Select
            data-testid="game-config-default-language"
            :model-value="typeof value === 'string' && value ? value : DEFAULT_LANGUAGE_EMPTY_VALUE"
            @update:model-value="handleChange($event === DEFAULT_LANGUAGE_EMPTY_VALUE ? '' : $event)"
          >
            <FormControl>
              <SelectTrigger
                data-testid="game-config-default-language-trigger"
                class="text-xs h-8 min-w-28 w-40"
              >
                <SelectValue :placeholder="$t('modals.gameConfig.fields.defaultLanguage.placeholder')" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem :value="DEFAULT_LANGUAGE_EMPTY_VALUE">
                {{ $t('modals.gameConfig.fields.defaultLanguage.empty') }}
              </SelectItem>
              <SelectItem
                v-for="option in defaultLanguageOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </SelectItem>
              <SelectItem
                v-if="typeof value === 'string' && value !== '' && !SUPPORTED_DEFAULT_LANGUAGES.has(value)"
                :value="value"
              >
                {{ value }}
              </SelectItem>
            </SelectContent>
          </Select>
        </FormItem>
      </FormField>

      <FormField
        v-slot="{ handleChange, value }"
        name="enableAppreciation"
      >
        <FormItem
          data-testid="game-config-enable-appreciation-row"
          class="flex flex-row gap-2 items-center justify-between"
        >
          <div class="flex flex-col gap-1">
            <FormLabel>{{ $t('modals.gameConfig.fields.enableAppreciation.label') }}</FormLabel>
            <FormDescription class="text-xs">
              {{ $t('modals.gameConfig.fields.enableAppreciation.description') }}
            </FormDescription>
          </div>
          <div class="flex flex-col gap-1 items-end">
            <FormControl>
              <Switch
                :model-value="Boolean(value)"
                @update:model-value="handleChange"
              />
            </FormControl>
          </div>
        </FormItem>
      </FormField>

      <FormField
        v-slot="{ handleChange, value }"
        name="enableContinue"
      >
        <FormItem
          data-testid="game-config-enable-continue-row"
          class="flex flex-row gap-2 items-center justify-between"
        >
          <div class="flex flex-col gap-1">
            <FormLabel>{{ $t('modals.gameConfig.fields.enableContinue.label') }}</FormLabel>
            <FormDescription class="text-xs">
              {{ $t('modals.gameConfig.fields.enableContinue.description') }}
            </FormDescription>
          </div>
          <div class="flex flex-col gap-1 items-end">
            <FormControl>
              <Switch
                :model-value="Boolean(value)"
                @update:model-value="handleChange"
              />
            </FormControl>
          </div>
        </FormItem>
      </FormField>

      <FormField
        v-slot="{ handleChange, value }"
        name="showPanic"
      >
        <FormItem
          data-testid="game-config-show-panic-row"
          class="flex flex-row gap-2 items-center justify-between"
        >
          <div class="flex flex-col gap-1">
            <FormLabel>{{ $t('modals.gameConfig.fields.showPanic.label') }}</FormLabel>
            <FormDescription class="text-xs">
              {{ $t('modals.gameConfig.fields.showPanic.description') }}
            </FormDescription>
          </div>
          <div class="flex flex-col gap-1 items-end">
            <FormControl>
              <Switch
                :model-value="Boolean(value)"
                @update:model-value="handleChange"
              />
            </FormControl>
          </div>
        </FormItem>
      </FormField>

      <FormField
        v-slot="{ handleChange, value }"
        name="legacyExpressionBlendMode"
      >
        <FormItem
          data-testid="game-config-legacy-expression-row"
          class="flex flex-row gap-2 items-center justify-between"
        >
          <div class="flex flex-col gap-1">
            <FormLabel>{{ $t('modals.gameConfig.fields.legacyExpressionBlendMode.label') }}</FormLabel>
            <FormDescription class="text-xs">
              {{ $t('modals.gameConfig.fields.legacyExpressionBlendMode.description') }}
            </FormDescription>
          </div>
          <div class="flex flex-col gap-1 items-end">
            <FormControl>
              <Switch
                :model-value="Boolean(value)"
                @update:model-value="handleChange"
              />
            </FormControl>
          </div>
        </FormItem>
      </FormField>

      <FormField
        v-slot="{ handleChange, value }"
        name="maxLine"
        :validate-on-model-update="false"
      >
        <FormItem class="gap-x-2 gap-y-1 grid grid-cols-[1fr_auto] items-center">
          <div class="flex flex-col gap-1">
            <FormLabel for="game-config-max-line">
              {{ $t('modals.gameConfig.fields.maxLine.label') }}
            </FormLabel>
            <FormDescription class="text-xs">
              {{ $t('modals.gameConfig.fields.maxLine.description') }}
            </FormDescription>
          </div>
          <FormControl>
            <Input
              id="game-config-max-line"
              data-testid="game-config-max-line"
              type="number"
              :model-value="value === '' ? '' : String(value ?? '')"
              class="text-xs w-26"
              @update:model-value="handleOptionalNumberChange(handleChange, $event)"
            />
          </FormControl>
          <FormMessage class="text-xs col-span-2" />
        </FormItem>
      </FormField>

      <FormField
        v-slot="{ handleChange, value }"
        name="lineHeight"
        :validate-on-model-update="false"
      >
        <FormItem class="gap-x-2 gap-y-1 grid grid-cols-[1fr_auto] items-center">
          <div class="flex flex-col gap-1">
            <FormLabel for="game-config-line-height">
              {{ $t('modals.gameConfig.fields.lineHeight.label') }}
            </FormLabel>
            <FormDescription class="text-xs">
              {{ $t('modals.gameConfig.fields.lineHeight.description') }}
            </FormDescription>
          </div>
          <FormControl>
            <Input
              id="game-config-line-height"
              data-testid="game-config-line-height"
              type="number"
              :model-value="value === '' ? '' : String(value ?? '')"
              class="text-xs w-26"
              @update:model-value="handleOptionalNumberChange(handleChange, $event)"
            />
          </FormControl>
          <FormMessage class="text-xs col-span-2" />
        </FormItem>
      </FormField>

      <FormField
        v-slot="{ componentField }"
        name="steamAppId"
        :validate-on-model-update="false"
      >
        <FormItem class="flex flex-col gap-2">
          <div class="flex flex-col gap-1">
            <FormLabel for="game-config-steam-app-id">
              {{ $t('modals.gameConfig.fields.steamAppId.label') }}
            </FormLabel>
            <FormDescription class="text-xs">
              {{ $t('modals.gameConfig.fields.steamAppId.description') }}
            </FormDescription>
          </div>
          <FormControl>
            <Input
              id="game-config-steam-app-id"
              data-testid="game-config-steam-app-id"
              v-bind="componentField"
              class="text-xs"
            />
          </FormControl>
          <FormMessage class="text-xs" />
        </FormItem>
      </FormField>

      <FormField
        v-slot="{ componentField }"
        name="packageName"
        :validate-on-model-update="false"
      >
        <FormItem class="flex flex-col gap-2">
          <div class="flex flex-col gap-1">
            <FormLabel for="game-config-package-name">
              {{ $t('modals.gameConfig.fields.packageName.label') }}
            </FormLabel>
            <FormDescription class="text-xs">
              {{ $t('modals.gameConfig.fields.packageName.description') }}
            </FormDescription>
          </div>
          <FormControl>
            <Input
              id="game-config-package-name"
              data-testid="game-config-package-name"
              v-bind="componentField"
              class="text-xs"
              :placeholder="$t('modals.gameConfig.fields.packageName.placeholder')"
            />
          </FormControl>
          <FormMessage class="text-xs" />
        </FormItem>
      </FormField>

      <FormField
        v-slot="{ handleChange, value }"
        name="gameKey"
      >
        <FormItem class="flex flex-col gap-2">
          <div class="flex flex-col gap-1">
            <FormLabel for="game-config-game-key">
              {{ $t('modals.gameConfig.fields.gameKey.label') }}
            </FormLabel>
            <FormDescription class="text-xs">
              {{ $t('modals.gameConfig.fields.gameKey.description') }}
            </FormDescription>
          </div>
          <FormControl>
            <InputGroup
              data-testid="game-config-game-key-group"
              class="bg-accent overflow-hidden"
            >
              <InputGroupInput
                id="game-config-game-key"
                data-testid="game-config-game-key"
                :model-value="typeof value === 'string' ? value : ''"
                readonly
                class="text-xs text-muted-foreground font-mono cursor-default!"
              />
              <InputGroupAddon align="inline-end" class="pr-1.5">
                <TooltipProvider :delay-duration="0">
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <InputGroupButton
                        data-testid="game-config-game-key-regenerate"
                        :aria-label="$t('modals.gameConfig.fields.gameKey.regenerate')"
                        size="icon-sm"
                        class="text-muted-foreground"
                        @click="applyGeneratedGameKey(handleChange)"
                      >
                        <div class="i-lucide-rotate-ccw size-3.5" />
                      </InputGroupButton>
                    </TooltipTrigger>
                    <TooltipContent side="top" class="px-2 py-1">
                      {{ $t('modals.gameConfig.fields.gameKey.regenerate') }}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </InputGroupAddon>
            </InputGroup>
          </FormControl>
        </FormItem>
      </FormField>
    </div>

    <section class="flex flex-col gap-3" data-testid="game-config-custom-section">
      <div class="flex flex-col gap-1">
        <h3 class="text-sm font-medium">
          {{ $t('modals.gameConfig.custom.title') }}
        </h3>
        <p class="text-xs text-muted-foreground">
          {{ $t('modals.gameConfig.custom.description') }}
        </p>
      </div>

      <div class="flex flex-col gap-3" data-testid="game-config-custom-list">
        <div
          v-for="(field, index) in customConfigFields"
          :key="field.key"
          class="gap-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start"
        >
          <FormField
            v-slot="{ handleChange, value }"
            :name="`customConfig[${index}].key`"
          >
            <FormItem class="flex flex-col gap-2">
              <FormLabel class="sr-only" :for="`game-config-custom-key-${index}`">
                {{ $t('modals.gameConfig.custom.keyLabel') }}
              </FormLabel>
              <FormControl>
                <Input
                  :id="`game-config-custom-key-${index}`"
                  :data-testid="`game-config-custom-key-${index}`"
                  :model-value="typeof value === 'string' ? value : field.value.key"
                  class="text-xs"
                  :placeholder="$t('modals.gameConfig.custom.keyPlaceholder')"
                  @update:model-value="handleTextInputChange(handleChange, $event)"
                />
              </FormControl>
              <FormMessage class="text-xs" />
            </FormItem>
          </FormField>

          <FormField
            v-slot="{ handleChange, value }"
            :name="`customConfig[${index}].value`"
          >
            <FormItem class="flex flex-col gap-2">
              <FormLabel class="sr-only" :for="`game-config-custom-value-${index}`">
                {{ $t('modals.gameConfig.custom.valueLabel') }}
              </FormLabel>
              <FormControl>
                <Input
                  :id="`game-config-custom-value-${index}`"
                  :data-testid="`game-config-custom-value-${index}`"
                  :model-value="typeof value === 'string' ? value : field.value.value"
                  class="text-xs"
                  :placeholder="$t('modals.gameConfig.custom.valuePlaceholder')"
                  @update:model-value="handleTextInputChange(handleChange, $event)"
                />
              </FormControl>
              <FormMessage class="text-xs" />
            </FormItem>
          </FormField>

          <TooltipProvider :delay-duration="0">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  class="text-muted-foreground self-start hover:text-destructive"
                  :aria-label="$t('modals.gameConfig.custom.remove')"
                  :data-testid="`game-config-custom-remove-${index}`"
                  @click="handleRemoveCustomConfig(index)"
                >
                  <X />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" class="px-2 py-1">
                {{ $t('modals.gameConfig.custom.remove') }}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div ref="customAddButtonContainerRef">
          <Button
            type="button"
            variant="outline"
            class="text-xs w-full"
            data-testid="game-config-custom-add"
            @click="handleAddCustomConfig"
          >
            {{ $t('modals.gameConfig.custom.add') }}
          </Button>
        </div>
      </div>
    </section>
  </div>
</template>
