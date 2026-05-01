<script setup lang="ts">
import { useEngines, useTemplates } from '~/composables/useDatabase'
import { formatEngineLabel } from '~/lib/engine-label'
import { isEngineUsable } from '~/services/engine-manager'

import type { Engine } from '~/database/model'
import type { TemplateBinding } from '~/types/project-config'

const FOLLOW_ENGINE_VALUE = '__followEngine__'
const ENGINE_BUILTIN_PREFIX = 'engineBuiltin:'
const STANDALONE_PREFIX = 'standalone:'

let modelValue = $(defineModel<TemplateBinding | undefined>())

const props = defineProps<{
  engineId?: string
  disabled?: boolean
}>()

const { t } = useI18n()

const templates = $(useTemplates())
const engines = $(useEngines())

const availableTemplates = $computed(() =>
  (templates ?? []).filter(template => template.status === 'created'),
)

const availableEngines = $computed(() =>
  (engines ?? []).filter(engine => isEngineUsable(engine)),
)

const currentEngine = $computed(() =>
  availableEngines.find(engine => engine.id === props.engineId),
)

const followEngineLabel = $computed(() => {
  if (!currentEngine) {
    return t('modals.createGame.templateFollowEngine')
  }
  return t('modals.createGame.templateFollowEngineWithName', {
    name: formatEngineLabel(currentEngine),
  })
})

function encodeEngineRef(engineId: string, version: string | undefined): string {
  return `${ENGINE_BUILTIN_PREFIX}${engineId}@${version ?? ''}`
}

function bindingToValue(binding: TemplateBinding | undefined): string {
  if (!binding) {
    return FOLLOW_ENGINE_VALUE
  }
  if (binding.kind === 'engineBuiltin') {
    return encodeEngineRef(binding.engine.id, binding.engine.version)
  }
  return `${STANDALONE_PREFIX}${binding.name}`
}

function buildEngineBuiltinBinding(engine: Engine): TemplateBinding {
  return {
    kind: 'engineBuiltin',
    engine: {
      id: engine.engineId,
      version: engine.version,
    },
  }
}

function valueToBinding(value: string): TemplateBinding | undefined {
  if (value === FOLLOW_ENGINE_VALUE) {
    return undefined
  }
  if (value.startsWith(ENGINE_BUILTIN_PREFIX)) {
    const payload = value.slice(ENGINE_BUILTIN_PREFIX.length)
    const atIndex = payload.lastIndexOf('@')
    const engineId = atIndex === -1 ? payload : payload.slice(0, atIndex)
    const version = atIndex === -1 ? undefined : (payload.slice(atIndex + 1) || undefined)
    const engine = availableEngines.find(item => item.engineId === engineId && item.version === version)
    return engine ? buildEngineBuiltinBinding(engine) : undefined
  }
  if (value.startsWith(STANDALONE_PREFIX)) {
    return { kind: 'standalone', name: value.slice(STANDALONE_PREFIX.length) }
  }
  return undefined
}

const selectedValue = $computed({
  get: () => bindingToValue(modelValue),
  set: (next: string) => {
    modelValue = valueToBinding(next)
  },
})

const selectedLabel = $computed(() => {
  const binding = modelValue
  if (!binding) {
    return followEngineLabel
  }
  if (binding.kind === 'engineBuiltin') {
    const engine = availableEngines.find(
      item => item.engineId === binding.engine.id && item.version === binding.engine.version,
    )
    return engine
      ? formatEngineLabel(engine)
      : (binding.engine.version
          ? `${binding.engine.id} ${binding.engine.version}`
          : binding.engine.id)
  }
  return binding.name
})
</script>

<template>
  <Select v-model="selectedValue" :disabled="props.disabled">
    <SelectTrigger class="w-full">
      <SelectValue>{{ selectedLabel }}</SelectValue>
    </SelectTrigger>
    <SelectContent>
      <SelectItem :value="FOLLOW_ENGINE_VALUE">
        {{ followEngineLabel }}
      </SelectItem>

      <template v-if="availableTemplates.length > 0">
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>{{ $t('modals.createGame.templateGroupStandalone') }}</SelectLabel>
          <SelectItem
            v-for="template in availableTemplates"
            :key="template.id"
            :value="`${STANDALONE_PREFIX}${template.metadata.name}`"
          >
            {{ template.metadata.name }}
          </SelectItem>
        </SelectGroup>
      </template>

      <template v-if="availableEngines.length > 0">
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>{{ $t('modals.createGame.templateGroupEngineBuiltin') }}</SelectLabel>
          <SelectItem
            v-for="engine in availableEngines"
            :key="engine.id"
            :value="encodeEngineRef(engine.engineId, engine.version)"
          >
            {{ formatEngineLabel(engine) }}
          </SelectItem>
        </SelectGroup>
      </template>
    </SelectContent>
  </Select>
</template>
