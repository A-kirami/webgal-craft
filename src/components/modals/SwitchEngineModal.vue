<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'

import { projectConfigCmds } from '~/commands/project-config'
import { db } from '~/database/db'
import { engineSwitch } from '~/services/engine-switch'
import { templateSwitch } from '~/services/template-switch'
import { useWorkspaceStore } from '~/stores/workspace'

import type { Game } from '~/database/model'

type Phase = 'idle' | 'switching' | 'failed'

const { t } = useI18n()
const open = defineModel<boolean>('open')

const props = defineProps<{
  game: Game
}>()

const workspaceStore = useWorkspaceStore()

let phase = $ref<Phase>('idle')
let lastError = $ref<string | undefined>(undefined)
let selectedEngineId = $ref<string | undefined>(undefined)
let templateStrategy = $ref<'explicit' | 'clean' | 'dirty'>('clean')
let showDirtyConfirm = $ref(false)
let lastDecision = $ref<'keep' | 'discard' | undefined>(undefined)
let preferredGroupId = $ref<string | undefined>(undefined)

const isSameEngine = $computed(() => selectedEngineId === props.game.engineId)

const isSwitching = $computed(() => phase === 'switching')

const canSwitch = $computed(() =>
  Boolean(selectedEngineId) && !isSameEngine && phase === 'idle',
)

watch(() => open.value, async (isOpen) => {
  if (!isOpen) {
    showDirtyConfirm = false
    return
  }

  phase = 'idle'
  lastError = undefined
  showDirtyConfirm = false
  lastDecision = undefined

  // 以当前游戏使用的引擎作为选择器初始值与默认偏好引擎组
  const currentEngine = props.game.engineId
    ? await db.engines.get(props.game.engineId)
    : undefined
  selectedEngineId = currentEngine?.id
  preferredGroupId = currentEngine?.engineId

  const config = await projectConfigCmds.readProjectConfig(props.game.path)
  templateStrategy = await templateSwitch.evaluateTemplateStrategy(props.game.path, config)
}, { immediate: true })

async function performSwitch(templateDecision?: 'keep' | 'discard'): Promise<void> {
  if (!selectedEngineId) {
    return
  }

  const targetEngine = await db.engines.get(selectedEngineId)
  if (!targetEngine) {
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
    // 刷新 workspace 快照，让状态栏与后续打开的弹窗读到新的 engineId
    if (workspaceStore.currentGame?.id === props.game.id) {
      await workspaceStore.refreshCurrentGameSnapshot()
    }
    open.value = false

    const versionLabel = targetEngine.version ? ` ${targetEngine.version}` : ''
    notify.success(t('modals.switchEngine.success', {
      name: targetEngine.name,
      version: versionLabel,
    }))
  } catch (error) {
    // 切换内部已回滚到旧状态；进入 failed 状态由用户选择重试或取消
    phase = 'failed'
    lastError = error instanceof Error ? error.message : String(error)
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
  // 切换已回滚，直接关闭对话框
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

      <!-- 切换进行中 -->
      <template v-if="phase === 'switching'">
        <div class="py-4 flex flex-col gap-3">
          <span class="text-sm text-muted-foreground text-center">
            {{ $t('modals.switchEngine.switching') }}
          </span>
        </div>
      </template>

      <!-- 切换失败：提供重试与取消 -->
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
