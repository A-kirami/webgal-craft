<script setup lang="ts">
import { usePreferenceStore } from '~/stores/preference'

import type {
  ImportDependencyIssueReason,
  ImportDependencyResolutionContext,
  ImportDependencyResolutionResult,
  ImportEngineDependencyIssue,
  ImportTemplateResolutionResult,
} from '~/types/import-dependency-resolution'
import type { EngineRef, TemplateBinding } from '~/types/project-config'

let open = $(defineModel<boolean>('open'))

const props = defineProps<{
  context: ImportDependencyResolutionContext
  onCancel?: () => void
  onConfirm?: (result: ImportDependencyResolutionResult) => void
}>()

const { t } = useI18n()
const preferenceStore = usePreferenceStore()

let selectedEngineId = $ref<string>()
let selectedTemplateDecision = $ref<ImportTemplateResolutionResult>()
let settled = $ref(false)

const needsEngine = $computed(() => !!props.context.engine)
const needsTemplate = $computed(() => !!props.context.template)
const selectedTemplateBinding = $computed(() =>
  selectedTemplateDecision?.action === 'set'
    ? selectedTemplateDecision.binding
    : undefined,
)
const selectedTemplateEngineId = $computed(() =>
  needsEngine ? selectedEngineId : props.context.resolvedEngineId,
)
const preferredEngineId = $computed(() =>
  props.context.engine?.current?.id ?? preferenceStore.defaultEngineId,
)

const engineReference = $computed(() =>
  props.context.engine?.current
    ? formatEngineReference(props.context.engine.current)
    : undefined,
)
const templateReference = $computed(() => props.context.template?.displayName)
const isRuntimeRebind = $computed(() => props.context.purpose === 'runtimeRebind')
const title = $computed(() =>
  isRuntimeRebind
    ? t('game.gameDependencyResolutionRuntimeRebindTitle')
    : t('game.gameDependencyResolutionTitle'),
)

const description = $computed(() => {
  const gameName = props.context.gameName?.trim()
  if (isRuntimeRebind) {
    return gameName
      ? t('game.gameDependencyResolutionRuntimeRebindDescriptionWithName', { name: gameName })
      : t('game.gameDependencyResolutionRuntimeRebindDescription')
  }

  if (props.context.source === 'legacy') {
    return gameName
      ? t('game.gameDependencyResolutionLegacyDescriptionWithName', { name: gameName })
      : t('game.gameDependencyResolutionLegacyDescription')
  }

  if (gameName) {
    return t('game.gameDependencyResolutionDescriptionWithName', { name: gameName })
  }
  return t('game.gameDependencyResolutionDescription')
})

const engineIssue = $computed(() => {
  if (isRuntimeRebind) {
    return t('game.gameDependencyResolutionRuntimeRebindEngineIssue')
  }

  return props.context.source === 'legacy'
    ? t('game.gameDependencyResolutionEngineLegacyIssue')
    : t('game.gameDependencyResolutionEngineIssue')
})
const engineReasonLabel = $computed(() =>
  resolveEngineReasonLabel(props.context.engine),
)
const templateReasonLabel = $computed(() =>
  resolveReasonLabel(props.context.template?.reason),
)
const scopeHint = $computed(() =>
  isRuntimeRebind
    ? t('game.gameDependencyResolutionRuntimeRebindScopeHint')
    : t('game.gameDependencyResolutionScopeHint'),
)
const cancelLabel = $computed(() =>
  isRuntimeRebind
    ? t('game.gameDependencyResolutionRuntimeRebindCancel')
    : t('game.gameDependencyResolutionCancel'),
)
const confirmLabel = $computed(() =>
  isRuntimeRebind
    ? t('game.gameDependencyResolutionRuntimeRebindConfirm')
    : t('game.gameDependencyResolutionConfirm'),
)

const canConfirm = $computed(() =>
  (!needsEngine || !!selectedEngineId)
  && (!needsTemplate || !!selectedTemplateDecision),
)

function formatEngineReference(engine: EngineRef) {
  return engine.version ? `${engine.id} ${engine.version}` : engine.id
}

function resolveEngineReasonLabel(issue: ImportEngineDependencyIssue | undefined) {
  if (!issue) {
    return
  }

  if (issue.reason !== 'incompatible') {
    return resolveReasonLabel(issue.reason)
  }

  switch (issue.compatibilityIssue) {
    case 'versionInvalid': {
      return t('game.gameDependencyResolutionReasonVersionInvalid')
    }
    case 'versionTooOld': {
      return t('game.gameDependencyResolutionReasonVersionTooOld')
    }
    case undefined: {
      return t('game.gameDependencyResolutionReasonIncompatible')
    }
    default: {
      return issue.compatibilityIssue satisfies never
    }
  }
}

function resolveReasonLabel(reason: ImportDependencyIssueReason | undefined) {
  switch (reason) {
    case 'missing': {
      return t('game.gameDependencyResolutionReasonMissing')
    }
    case 'unavailable': {
      return t('game.gameDependencyResolutionReasonUnavailable')
    }
    case 'incompatible': {
      return t('game.gameDependencyResolutionReasonIncompatible')
    }
    case 'selectionRequired': {
      return t('game.gameDependencyResolutionReasonSelectionRequired')
    }
    case undefined: {
      return
    }
    default: {
      return reason satisfies never
    }
  }
}

function setTemplateBinding(binding: TemplateBinding | undefined) {
  selectedTemplateDecision = binding
    ? { action: 'set', binding }
    : { action: 'followEngine' }
}

function handleCancel() {
  if (settled) {
    return
  }

  settled = true
  open = false
  props.onCancel?.()
}

function handleConfirm() {
  if (!canConfirm || settled) {
    return
  }

  settled = true
  open = false
  props.onConfirm?.({
    ...(needsEngine ? { engineId: selectedEngineId } : {}),
    ...(needsTemplate && selectedTemplateDecision ? { template: selectedTemplateDecision } : {}),
  })
}

function handleDialogOpenChange(nextOpen: boolean) {
  if (!nextOpen) {
    handleCancel()
    return
  }

  open = nextOpen
}

watch(
  () => [open, props.context] as const,
  ([isOpen]) => {
    if (!isOpen) {
      return
    }

    settled = false
    selectedEngineId = undefined
    selectedTemplateDecision = props.context.template ? { action: 'followEngine' } : undefined
  },
  { immediate: true },
)
</script>

<template>
  <Dialog :open="open" @update:open="handleDialogOpenChange">
    <DialogContent class="sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>
          {{ description }}
        </DialogDescription>
      </DialogHeader>

      <div class="py-1 gap-3 grid">
        <section v-if="needsEngine" class="p-3 border rounded-md bg-muted/20 gap-3 grid">
          <div class="gap-1 grid">
            <div class="flex flex-wrap gap-2 items-center">
              <Label class="text-sm font-medium">
                {{ $t('game.gameDependencyResolutionEngineTitle') }}
              </Label>
              <span
                v-if="engineReasonLabel"
                class="text-[11px] text-muted-foreground leading-5 px-1.5 border rounded-md bg-background"
              >
                {{ engineReasonLabel }}
              </span>
            </div>
            <p class="text-xs text-muted-foreground">
              {{ engineIssue }}
            </p>
          </div>

          <dl v-if="engineReference" class="text-xs px-2.5 py-2 border rounded-md bg-background/70 gap-1 grid">
            <div class="gap-2 grid sm:grid-cols-[5rem_1fr]">
              <dt class="text-muted-foreground">
                {{ $t('game.gameDependencyResolutionOriginalEngine') }}
              </dt>
              <dd class="font-mono break-all">
                {{ engineReference }}
              </dd>
            </div>
          </dl>

          <EngineSelector
            ::="selectedEngineId"
            :preferred-engine-id="preferredEngineId"
          />
        </section>

        <section v-if="needsTemplate" class="p-3 border rounded-md bg-muted/20 gap-3 grid">
          <div class="gap-1 grid">
            <div class="flex flex-wrap gap-2 items-center">
              <Label class="text-sm font-medium">
                {{ $t('game.gameDependencyResolutionTemplateTitle') }}
              </Label>
              <span
                v-if="templateReasonLabel"
                class="text-[11px] text-muted-foreground leading-5 px-1.5 border rounded-md bg-background"
              >
                {{ templateReasonLabel }}
              </span>
            </div>
            <p class="text-xs text-muted-foreground">
              {{ $t('game.gameDependencyResolutionTemplateIssue') }}
            </p>
          </div>

          <dl v-if="templateReference" class="text-xs px-2.5 py-2 border rounded-md bg-background/70 gap-1 grid">
            <div class="gap-2 grid sm:grid-cols-[5rem_1fr]">
              <dt class="text-muted-foreground">
                {{ $t('game.gameDependencyResolutionOriginalTemplate') }}
              </dt>
              <dd class="break-all">
                {{ templateReference }}
              </dd>
            </div>
          </dl>

          <TemplateSelector
            :model-value="selectedTemplateBinding"
            :engine-id="selectedTemplateEngineId"
            @update:model-value="setTemplateBinding"
          />

          <p class="text-xs text-muted-foreground">
            {{ $t('game.gameDependencyResolutionTemplateFollowEngineHint') }}
          </p>
        </section>

        <p class="text-xs text-muted-foreground">
          {{ scopeHint }}
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="handleCancel">
          {{ cancelLabel }}
        </Button>
        <Button :disabled="!canConfirm" @click="handleConfirm">
          {{ confirmLabel }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
