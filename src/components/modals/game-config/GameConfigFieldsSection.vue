<script setup lang="ts">
import { FormField } from '~/components/ui/form'
import { AUDIO_EXTENSIONS } from '~/features/editor/command-registry/common-params'
import { createGameConfigKey } from '~/features/modals/game-config/game-config-form'

interface Props {
  backgroundRootPath: string
  bgmRootPath: string
  gamePath: string
  serveUrl?: string
}

defineProps<Props>()

const DEFAULT_LANGUAGE_EMPTY_VALUE = '__runtime_fallback__'

const defaultLanguageOptions = [
  {
    label: '简体中文',
    value: 'zh_CN',
  },
  {
    label: '繁體中文',
    value: 'zh_TW',
  },
  {
    label: 'English',
    value: 'en',
  },
  {
    label: '日本語',
    value: 'ja',
  },
  {
    label: 'Français',
    value: 'fr',
  },
  {
    label: 'Deutsch',
    value: 'de',
  },
] as const

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
</script>

<template>
  <div class="flex flex-col gap-6">
    <div data-testid="game-config-fields" class="gap-5 grid">
      <FormField
        v-slot="{ componentField }"
        name="gameName"
      >
        <FormItem class="flex flex-col gap-2">
          <FormLabel for="game-config-game-name">
            {{ $t('modals.gameConfig.fields.gameName.label') }}
          </FormLabel>
          <FormControl>
            <Input
              id="game-config-game-name"
              data-testid="game-config-game-name"
              v-bind="componentField"
              class="text-xs h-8 shadow-none"
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
          <FormLabel for="game-config-description">
            {{ $t('modals.gameConfig.fields.description.label') }}
          </FormLabel>
          <FormControl>
            <Textarea
              id="game-config-description"
              data-testid="game-config-description"
              :model-value="typeof value === 'string' ? value : ''"
              class="text-xs py-1.5 min-h-16 resize-none shadow-none"
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
          <FormLabel>
            {{ $t('modals.gameConfig.fields.titleImg.label') }}
          </FormLabel>
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
          <FormLabel for="game-config-title-bgm">
            {{ $t('modals.gameConfig.fields.titleBgm.label') }}
          </FormLabel>
          <FormControl>
            <FilePicker
              input-id="game-config-title-bgm"
              :model-value="String(componentField.modelValue ?? '')"
              :root-path="bgmRootPath"
              :extensions="AUDIO_EXTENSIONS"
              :popover-title="$t('modals.gameConfig.fields.titleBgm.pickerTitle')"
              history-scope-key="game-config-title-bgm"
              class="w-full [&_input]:text-xs [&_input]:h-8 [&_input]:w-full [&_input]:shadow-none"
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
        <FormItem class="flex flex-row gap-2 items-center justify-between">
          <FormLabel>{{ $t('modals.gameConfig.fields.defaultLanguage.label') }}</FormLabel>
          <Select
            data-testid="game-config-default-language"
            :model-value="typeof value === 'string' && value ? value : DEFAULT_LANGUAGE_EMPTY_VALUE"
            @update:model-value="handleChange($event === DEFAULT_LANGUAGE_EMPTY_VALUE ? '' : $event)"
          >
            <FormControl>
              <SelectTrigger
                data-testid="game-config-default-language-trigger"
                class="text-xs h-8 min-w-28 w-40 shadow-none"
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
        <FormItem class="flex flex-col gap-2">
          <div class="flex flex-row gap-2 items-center justify-between">
            <FormLabel for="game-config-max-line">
              {{ $t('modals.gameConfig.fields.maxLine.label') }}
            </FormLabel>
            <FormControl>
              <Input
                id="game-config-max-line"
                data-testid="game-config-max-line"
                type="number"
                :model-value="value === '' ? '' : String(value ?? '')"
                class="text-xs h-8 w-26 shadow-none"
                @update:model-value="handleOptionalNumberChange(handleChange, $event)"
              />
            </FormControl>
          </div>
          <FormMessage class="text-xs" />
        </FormItem>
      </FormField>

      <FormField
        v-slot="{ handleChange, value }"
        name="lineHeight"
        :validate-on-model-update="false"
      >
        <FormItem class="flex flex-col gap-2">
          <div class="flex flex-row gap-2 items-center justify-between">
            <FormLabel for="game-config-line-height">
              {{ $t('modals.gameConfig.fields.lineHeight.label') }}
            </FormLabel>
            <FormControl>
              <Input
                id="game-config-line-height"
                data-testid="game-config-line-height"
                type="number"
                :model-value="value === '' ? '' : String(value ?? '')"
                class="text-xs h-8 w-26 shadow-none"
                @update:model-value="handleOptionalNumberChange(handleChange, $event)"
              />
            </FormControl>
          </div>
          <FormMessage class="text-xs" />
        </FormItem>
      </FormField>

      <FormField
        v-slot="{ componentField }"
        name="steamAppId"
        :validate-on-model-update="false"
      >
        <FormItem class="flex flex-col gap-2">
          <div class="flex gap-1.5 items-center">
            <FormLabel for="game-config-steam-app-id">
              {{ $t('modals.gameConfig.fields.steamAppId.label') }}
            </FormLabel>
            <TooltipProvider :delay-duration="0">
              <Tooltip>
                <TooltipTrigger as-child>
                  <button
                    type="button"
                    class="text-muted-foreground/80 transition-colors hover:text-foreground"
                    :aria-label="$t('modals.gameConfig.fields.steamAppId.description')"
                  >
                    <div class="i-lucide-circle-help size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" class="px-2 py-1 max-w-64">
                  {{ $t('modals.gameConfig.fields.steamAppId.description') }}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <FormControl>
            <Input
              id="game-config-steam-app-id"
              data-testid="game-config-steam-app-id"
              v-bind="componentField"
              class="text-xs h-8 shadow-none"
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
          <div class="flex gap-1.5 items-center">
            <FormLabel for="game-config-package-name">
              {{ $t('modals.gameConfig.fields.packageName.label') }}
            </FormLabel>
            <TooltipProvider :delay-duration="0">
              <Tooltip>
                <TooltipTrigger as-child>
                  <button
                    type="button"
                    class="text-muted-foreground/80 transition-colors hover:text-foreground"
                    :aria-label="$t('modals.gameConfig.fields.packageName.description')"
                  >
                    <div class="i-lucide-circle-help size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" class="px-2 py-1 max-w-64">
                  {{ $t('modals.gameConfig.fields.packageName.description') }}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <FormControl>
            <Input
              id="game-config-package-name"
              data-testid="game-config-package-name"
              v-bind="componentField"
              class="text-xs h-8 shadow-none"
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
          <div class="flex gap-1.5 items-center">
            <FormLabel for="game-config-game-key">
              {{ $t('modals.gameConfig.fields.gameKey.label') }}
            </FormLabel>
            <TooltipProvider :delay-duration="0">
              <Tooltip>
                <TooltipTrigger as-child>
                  <button
                    type="button"
                    class="text-muted-foreground/80 transition-colors hover:text-foreground"
                    :aria-label="$t('modals.gameConfig.fields.gameKey.description')"
                  >
                    <div class="i-lucide-circle-help size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" class="px-2 py-1 max-w-64">
                  {{ $t('modals.gameConfig.fields.gameKey.description') }}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <FormControl>
            <InputGroup
              data-testid="game-config-game-key-group"
              class="bg-accent h-8 shadow-none overflow-hidden"
            >
              <InputGroupInput
                id="game-config-game-key"
                data-testid="game-config-game-key"
                :model-value="typeof value === 'string' ? value : ''"
                readonly
                class="text-xs text-muted-foreground font-mono h-8 shadow-none cursor-default!"
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
  </div>
</template>
