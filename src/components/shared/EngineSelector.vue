<script setup lang="ts">
import { useEngineGroups } from '~/composables/use-engine-groups'
import { isEngineUsable } from '~/services/engine-manager'

let modelValue = $(defineModel<string>())

const props = defineProps<{
  preferredEngineId?: string
}>()

const { groups } = $(useEngineGroups())

const availableGroups = $computed(() =>
  groups
    .map(group => ({
      ...group,
      engines: group.engines.filter(engine => isEngineUsable(engine)),
    }))
    .filter(group => group.engines.length > 0),
)

let selectedGroupId = $ref('')
let selectedEngineId = $ref(modelValue ?? '')

const currentGroup = $computed(() =>
  availableGroups.find(group => group.engineId === selectedGroupId),
)

const versionOptions = $computed(() =>
  currentGroup?.engines ?? [],
)

// Sync internal selection when available groups, modelValue, or preferred group change.
watch(
  [() => availableGroups, () => modelValue, () => props.preferredEngineId],
  ([nextGroups, nextModelValue]) => {
    if (nextGroups.length === 0) {
      selectedGroupId = ''
      selectedEngineId = ''
      modelValue = undefined
      return
    }

    if (nextModelValue) {
      const matchedGroup = nextGroups.find(group =>
        group.engines.some(engine => engine.id === nextModelValue),
      )
      if (matchedGroup) {
        selectedGroupId = matchedGroup.engineId
        selectedEngineId = nextModelValue
        return
      }
    }

    const fallbackGroup = nextGroups.find(group => group.engineId === props.preferredEngineId) ?? nextGroups[0]
    const fallbackEngine = fallbackGroup?.engines[0]
    selectedGroupId = fallbackGroup?.engineId ?? ''
    selectedEngineId = fallbackEngine?.id ?? ''
    modelValue = fallbackEngine?.id
  },
  { immediate: true },
)

// Reflect user-driven group/version changes back to modelValue.
watch([() => selectedGroupId, () => selectedEngineId], ([nextGroupId, nextEngineId], [prevGroupId]) => {
  if (nextGroupId !== prevGroupId) {
    const group = availableGroups.find(item => item.engineId === nextGroupId)
    if (!group) {
      return
    }
    const nextEngine = group.engines.find(engine => engine.id === nextEngineId) ?? group.engines[0]
    selectedEngineId = nextEngine?.id ?? ''
    modelValue = nextEngine?.id
    return
  }

  modelValue = nextEngineId || undefined
})
</script>

<template>
  <div class="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
    <Select v-model="selectedGroupId">
      <SelectTrigger class="w-full">
        <SelectValue :placeholder="$t('engine.selectName')" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem
          v-for="group in availableGroups"
          :key="group.engineId"
          :value="group.engineId"
        >
          {{ group.name }}
        </SelectItem>
      </SelectContent>
    </Select>

    <Select
      v-if="currentGroup && versionOptions.length > 0"
      v-model="selectedEngineId"
    >
      <SelectTrigger class="w-full">
        <SelectValue :placeholder="$t('engine.selectVersion')" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem
          v-for="engine in versionOptions"
          :key="engine.id"
          :value="engine.id"
        >
          {{ engine.version ?? $t('common.unknown') }}
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>
