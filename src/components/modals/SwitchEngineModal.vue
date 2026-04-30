<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'

import { projectConfigCmds } from '~/commands/project-config'
import { db } from '~/database/db'
import { engineSwitch } from '~/services/engine-switch'
import { templateSwitch } from '~/services/template-switch'
import { useWorkspaceStore } from '~/stores/workspace'

import type { Game } from '~/database/model'

type Phase = 'idle' | 'switching' | 'failed'
type FailedAction = 'init' | 'switch'
type TemplateStrategy = 'explicit' | 'clean' | 'dirty'

const { t } = useI18n()
const open = defineModel<boolean>('open')

const props = defineProps<{
  game: Game
}>()

const workspaceStore = useWorkspaceStore()

let phase = $ref<Phase>('idle')
let lastError = $ref<string | undefined>(undefined)
let selectedEngineId = $ref<string | undefined>(undefined)
let templateStrategy = $ref<TemplateStrategy | undefined>(undefined)
let showDirtyConfirm = $ref(false)
let lastDecision = $ref<'keep' | 'discard' | undefined>(undefined)
let preferredGroupId = $ref<string | undefined>(undefined)
let lastFailedAction = $ref<FailedAction | undefined>(undefined)

const isSameEngine = $computed(() => selectedEngineId === props.game.engineId)

const isSwitching = $computed(() => phase === 'switching')

const canSwitch = $computed(() =>
  Boolean(selectedEngineId) && !isSameEngine && phase === 'idle' && templateStrategy !== undefined,
)

async function initOnOpen(): Promise<void> {
  phase = 'idle'
  showDirtyConfirm = false
  lastDecision = undefined
  templateStrategy = undefined

  // Use the game's current engine as both the initial selection and preferred group.
  try {
    const currentEngine = props.game.engineId
      ? await db.engines.get(props.game.engineId)
      : undefined
    selectedEngineId = currentEngine?.id
    preferredGroupId = currentEngine?.engineId

    const config = await projectConfigCmds.readProjectConfig(props.game.path)
    templateStrategy = await templateSwitch.evaluateTemplateStrategy(props.game.path, config)
    lastError = undefined
    lastFailedAction = undefined
  } catch (error) {
    phase = 'failed'
    lastFailedAction = 'init'
    showDirtyConfirm = false
    templateStrategy = undefined
    lastError = error instanceof Error ? error.message : String(error)
  }
}

watch(() => open.value, async (isOpen) => {
  if (!isOpen) {
    showDirtyConfirm = false
    return
  }

  await initOnOpen()
}, { immediate: true })

async function performSwitch(templateDecision?: 'keep' | 'discard'): Promise<void> {
  if (!selectedEngineId || templateStrategy === undefined) {
    return
  }

  const targetEngine = await db.engines.get(selectedEngineId)
  if (!targetEngine) {
    phase = 'failed'
    lastFailedAction = 'switch'
    lastError = t('modals.switchEngine.failed.missingEngine')
    return
  }

  phase = 'switching'
  lastError = undefined
  lastDecision = templateDecision
  try {
    const options = templateStrategy === 'dirty' && templateDecision
      ? { templateDecision }
      : {}

    await engineSwitch.switchEngine(props.game, targetEngine, options)
    open.value = false

    const versionLabel = targetEngine.version ? ` ${targetEngine.version}` : ''
    notify.success(t('modals.switchEngine.success', {
      name: targetEngine.name,
      version: versionLabel,
    }))
  } catch (error) {
    // The switch already rolled back internally; let the user retry or cancel from the failed state.
    phase = 'failed'
    lastFailedAction = 'switch'
    lastError = error instanceof Error ? error.message : String(error)
    return
  }

  // Refresh workspace snapshot after the switch succeeds so UI-only refresh failures do not rewrite switch status.
  if (workspaceStore.currentGame?.id === props.game.id) {
    try {
      await workspaceStore.refreshCurrentGameSnapshot()
    } catch (error) {
      void logger.warn(`[SwitchEngineModal] 刷新当前游戏快照失败: ${String(error)}`)
    }
  }
}

async function handleConfirm(): Promise<void> {
  if (!canSwitch) {
    return
  }
  if (templateStrategy === 'dirty') {
    showDirtyConfirm = true
    return
  }
  await performSwitch()
}

async function handleRetry(): Promise<void> {
  if (lastFailedAction === 'init') {
    await initOnOpen()
    return
  }
  await performSwitch(lastDecision)
}

async function handleDirtyKeep(): Promise<void> {
  showDirtyConfirm = false
  await performSwitch('keep')
}

async function handleDirtyDiscard(): Promise<void> {
  showDirtyConfirm = false
  await performSwitch('discard')
}

function handleCancelFailed(): void {
  open.value = false
}
</script>

<template>
  <Dialog ::open="open">
    <DialogContent class="sm:max-w-[425px]" :hide-close="isSwitching">
      <DialogHeader>
        <DialogTitle>
          {{ $t('modals.switchEngine.title') }}
        </DialogTitle>
        <DialogDescription>
          {{ $t('modals.switchEngine.description') }}
        </DialogDescription>
      </DialogHeader>

      <template v-if="phase === 'switching'">
        <div class="py-4 flex flex-col gap-3">
          <span class="text-sm text-muted-foreground text-center">
            {{ $t('modals.switchEngine.switching') }}
          </span>
        </div>
      </template>

      <template v-else-if="phase === 'failed'">
        <div class="text-sm text-destructive p-3 rounded-md bg-destructive/10 flex flex-col gap-2">
          <div class="font-medium flex gap-2 items-center">
            <TriangleAlert class="size-4" />
            {{ $t('modals.switchEngine.failed.title') }}
          </div>
          <span class="text-muted-foreground">
            {{ $t('modals.switchEngine.failed.description') }}
          </span>
          <span v-if="lastError" class="text-xs break-all">{{ lastError }}</span>
        </div>
      </template>

      <template v-else>
        <div class="gap-4 grid">
          <div class="px-2 gap-x-4 gap-y-2 grid grid-cols-[auto_1fr] items-center">
            <Label class="text-right whitespace-nowrap">
              {{ $t('modals.switchEngine.engineLabel') }}
            </Label>
            <EngineSelector
              ::="selectedEngineId"
              :preferred-engine-id="preferredGroupId"
            />
          </div>
        </div>
      </template>

      <DialogFooter v-if="phase === 'idle'">
        <DialogClose as-child>
          <Button variant="outline">
            {{ $t('common.cancel') }}
          </Button>
        </DialogClose>
        <Button :disabled="!canSwitch" @click="handleConfirm">
          {{ $t('common.confirm') }}
        </Button>
      </DialogFooter>

      <DialogFooter v-else-if="phase === 'failed'">
        <Button variant="outline" @click="handleCancelFailed">
          {{ $t('modals.switchEngine.failed.cancel') }}
        </Button>
        <Button @click="handleRetry">
          {{ $t('modals.switchEngine.failed.retry') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <AlertDialog ::open="showDirtyConfirm">
    <AlertDialogContent>
      <div class="flex flex-col gap-2 sm:flex-row sm:gap-4 max-sm:items-center">
        <div
          class="text-yellow-500 rounded-lg bg-yellow/10 flex shrink-0 size-9 items-center justify-center"
          aria-hidden="true"
        >
          <TriangleAlert class="size-5" aria-hidden="true" />
        </div>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{ $t('modals.switchEngine.templateDirty.title') }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {{ $t('modals.switchEngine.templateDirty.description') }}
          </AlertDialogDescription>
        </AlertDialogHeader>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>
          {{ $t('common.cancel') }}
        </AlertDialogCancel>
        <Button variant="destructive" @click="handleDirtyDiscard">
          {{ $t('modals.switchEngine.templateDirty.discard') }}
        </Button>
        <AlertDialogAction @click="handleDirtyKeep">
          {{ $t('modals.switchEngine.templateDirty.keep') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
