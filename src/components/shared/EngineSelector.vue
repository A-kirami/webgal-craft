<script setup lang="ts">
import { useEngineGroups } from '~/composables/use-engine-groups'

let modelValue = $(defineModel<string>())

const props = defineProps<{
  preferredEngineId?: string
}>()

const { groups } = $(useEngineGroups())

const availableGroups = $computed(() =>
  groups
    .map(group => ({
      ...group,
      engines: group.engines.filter(engine => engine.status === 'created'),
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

// 合并 watch：当可用引擎组、modelValue 或偏好引擎变化时，同步内部状态
watch(
  [() => availableGroups, () => modelValue, () => props.preferredEngineId],
  ([nextGroups, nextModelValue]) => {
    // 无可用引擎组时重置所有状态
    if (nextGroups.length === 0) {
      selectedGroupId = ''
      selectedEngineId = ''
      modelValue = undefined
      return
    }

    // modelValue 指向一个有效引擎时，直接同步内部状态
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

    // modelValue 无效或为空：回退到偏好引擎组或第一个组的首个引擎
    const fallbackGroup = nextGroups.find(group => group.engineId === props.preferredEngineId) ?? nextGroups[0]
    const fallbackEngine = fallbackGroup?.engines[0]
    selectedGroupId = fallbackGroup?.engineId ?? ''
    selectedEngineId = fallbackEngine?.id ?? ''
    modelValue = fallbackEngine?.id
  },
  { immediate: true },
)

// 用户通过下拉切换引擎组或版本时，同步选中状态并写回 modelValue
watch([() => selectedGroupId, () => selectedEngineId], ([nextGroupId, nextEngineId], [prevGroupId]) => {
  // 引擎组变更：切换到该组的首个引擎
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

  // 版本变更：直接同步到 modelValue
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
