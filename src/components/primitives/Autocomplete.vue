<script setup lang="ts">
import {
  ComboboxAnchor,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxPortal,
  ComboboxRoot,
  ComboboxViewport,
} from 'reka-ui'

import { cn } from '~/lib/utils'

import type { HTMLAttributes } from 'vue'

defineOptions({
  inheritAttrs: false,
})

interface AutocompleteOption {
  group?: string
  label: string
  value: string
}

interface AutocompleteOptionGroup {
  group?: string
  options: AutocompleteOption[]
}

interface AutocompleteInputHandle {
  focus: () => void
  markHighlightIntent: () => void
  resetHighlightIntent: () => void
}

const props = withDefaults(defineProps<{
  class?: HTMLAttributes['class']
  containerClass?: HTMLAttributes['class']
  contentReference?: HTMLElement
  id?: string
  options: AutocompleteOption[]
  placeholder?: string
  showIndicator?: boolean
}>(), {
  showIndicator: true,
})

const [DefineOptionItem, ReuseOptionItem] = createReusableTemplate<{
  option: AutocompleteOption
}>({ inheritAttrs: false })

function markManualHighlightIntent() {
  input.value?.markHighlightIntent()
}

function resetManualHighlightIntent() {
  input.value?.resetHighlightIntent()
}

let modelValue = $(defineModel<string>({ default: '' }))
const attrs = useAttrs()
const input = useTemplateRef<AutocompleteInputHandle>('input')

const availableOptions = $computed(() => {
  return props.options.filter(option => option.value !== '')
})

const shouldShowSuggestions = $computed(() => availableOptions.length > 0)
const shouldShowIndicator = $computed(() => shouldShowSuggestions && props.showIndicator)

const visibleGroupNames = $computed(() => {
  return [...new Set(
    availableOptions
      .map(option => option.group?.trim())
      .filter((group): group is string => !!group),
  )]
})

const shouldShowGroups = $computed(() => visibleGroupNames.length > 1)

const optionGroups = $computed<AutocompleteOptionGroup[]>(() => {
  if (!shouldShowGroups) {
    return [{ options: availableOptions }]
  }

  const groups: AutocompleteOptionGroup[] = []
  const groupIndex = new Map<string | undefined, AutocompleteOptionGroup>()

  for (const option of availableOptions) {
    const groupName = option.group?.trim() || undefined
    let group = groupIndex.get(groupName)
    if (!group) {
      group = { group: groupName, options: [] }
      groupIndex.set(groupName, group)
      groups.push(group)
    }
    group.options.push(option)
  }

  return groups
})

function findOptionByValue(value: string) {
  return availableOptions.find(option => option.value === value)
}

function formatDisplayValue(value: string) {
  return findOptionByValue(value)?.label ?? value
}

function formatSearchText(option: AutocompleteOption) {
  if (option.label === option.value) {
    return option.label
  }

  return `${option.label} ${option.value}`
}

let isEditing = $ref(false)
let open = $ref(false)

const isDisplayingOptionLabel = $computed(() => {
  const selectedOption = findOptionByValue(modelValue)
  return !isEditing
    && !!selectedOption
    && selectedOption.label !== selectedOption.value
})

const inputValue = computed({
  get() {
    return isEditing ? modelValue : formatDisplayValue(modelValue)
  },
  set(value: string) {
    isEditing = true
    modelValue = value
  },
})

function handleOptionSelect(value: unknown) {
  isEditing = false
  modelValue = String(value ?? '')
  nextTick(() => input.value?.focus())
}

function handleOpenChange(nextOpen: boolean) {
  open = nextOpen && Boolean(shouldShowSuggestions)
  if (!open) {
    resetManualHighlightIntent()
    isEditing = false
  }
}

watch(
  () => shouldShowSuggestions,
  (hasSuggestions) => {
    if (!hasSuggestions) {
      handleOpenChange(false)
    }
  },
)

function handleEnter(event: KeyboardEvent) {
  if (!open || event.isComposing || event.defaultPrevented) {
    return
  }

  event.preventDefault()
  resetManualHighlightIntent()
  open = false
  isEditing = false
}

function beginEditingOptionLabel(event: InputEvent | CompositionEvent) {
  if (!isDisplayingOptionLabel) {
    return
  }

  isEditing = true
  modelValue = ''
  // 选项标签仅用于展示；进入原生编辑时从空的原始值开始。
  const input = event.target as HTMLInputElement
  input.value = ''
}

function handleBeforeInput(event: InputEvent) {
  if (!event.isComposing) {
    beginEditingOptionLabel(event)
  }
}
</script>

<template>
  <ComboboxRoot
    :model-value="modelValue"
    :open="open"
    :open-on-focus="false"
    :open-on-click="false"
    :reset-search-term-on-blur="false"
    :reset-search-term-on-select="false"
    :class="cn('max-w-full min-w-0 relative', props.containerClass)"
    @update:model-value="handleOptionSelect"
    @update:open="handleOpenChange"
  >
    <ComboboxAnchor as-child>
      <div :class="cn('max-w-full min-w-0 relative', props.containerClass)">
        <ManualComboboxInput
          v-bind="attrs"
          :id="props.id"
          ref="input"
          v-model="inputValue"
          :open-on-pointer="shouldShowSuggestions"
          :placeholder="props.placeholder"
          :class="cn(
            'border border-input bg-transparent rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            props.class,
            shouldShowIndicator && 'pr-7',
          )"
          @beforeinput="handleBeforeInput"
          @compositionstart.capture="beginEditingOptionLabel"
          @keydown.enter="handleEnter"
        />
        <div
          v-if="shouldShowIndicator"
          aria-hidden="true"
          class="i-lucide-chevron-down opacity-50 shrink-0 h-4 w-4 pointer-events-none right-2 top-1/2 absolute -translate-y-1/2 group-data-[severity=error]/statement-diagnostic:text-destructive! group-data-[severity=warning]/statement-diagnostic:text-yellow-700! dark:group-data-[severity=warning]/statement-diagnostic:text-yellow-300!"
          data-testid="autocomplete-indicator"
        />
      </div>
    </ComboboxAnchor>

    <ComboboxPortal>
      <!-- Reka 会在卸载前清除筛选条件，否则离场动画期间会显示过期的选项。 -->
      <ComboboxContent
        v-if="shouldShowSuggestions"
        align="start"
        position="popper"
        :reference="props.contentReference"
        :side-offset="4"
        :style="{ minWidth: 'max(8rem, var(--reka-combobox-trigger-width))' }"
        class="text-popover-foreground text-left border rounded-md bg-popover shadow-md z-50 overflow-hidden data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"
      >
        <ComboboxViewport class="p-1 max-h-40vh">
          <DefineOptionItem v-slot="{ option }">
            <ComboboxItem
              :value="option.value"
              :text-value="formatSearchText(option)"
              class="text-xs px-2 py-1.5 text-left outline-none rounded-sm flex gap-2 w-full cursor-default select-none items-center justify-start data-[highlighted]:text-accent-foreground data-[highlighted]:bg-accent"
              @pointermove.capture="markManualHighlightIntent"
            >
              <span class="flex shrink-0 size-3.5 items-center justify-center">
                <ComboboxItemIndicator>
                  <div class="i-lucide-check size-3.5" />
                </ComboboxItemIndicator>
              </span>
              <span class="text-left flex-1 min-w-0 whitespace-pre text-ellipsis overflow-hidden">{{ option.label }}</span>
            </ComboboxItem>
          </DefineOptionItem>
          <template
            v-for="group in optionGroups"
            :key="group.group ?? '__ungrouped__'"
          >
            <ComboboxGroup v-if="shouldShowGroups && group.group">
              <ComboboxLabel class="text-[0.6875rem] text-muted-foreground font-medium px-2 py-1">
                {{ group.group }}
              </ComboboxLabel>
              <ReuseOptionItem
                v-for="option in group.options"
                :key="option.value"
                :option="option"
              />
            </ComboboxGroup>
            <template v-else>
              <ReuseOptionItem
                v-for="option in group.options"
                :key="option.value"
                :option="option"
              />
            </template>
          </template>
          <ComboboxEmpty class="text-sm text-muted-foreground px-2 py-6 text-center">
            {{ $t('common.noResults') }}
          </ComboboxEmpty>
        </ComboboxViewport>
      </ComboboxContent>
    </ComboboxPortal>
  </ComboboxRoot>
</template>
