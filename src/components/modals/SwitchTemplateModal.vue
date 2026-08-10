<script setup lang="ts">
import { RotateCcw, TriangleAlert } from '@lucide/vue'

import { projectConfigCmds } from '~/commands/project-config'
import { db } from '~/database/db'
import { isEngineUsable } from '~/services/engine-manager'
import { templateSwitch } from '~/services/template-switch'
import { useWorkspaceStore } from '~/stores/workspace'
import { handleError } from '~/utils/error-handler'

import type { Game } from '~/database/model'
import type { TemplateBinding } from '~/types/project-config'

const { t } = useI18n()
const open = defineModel<boolean>('open')

const props = defineProps<{
  game: Game
}>()

const workspaceStore = useWorkspaceStore()

let isSwitching = $ref(false)
let isResetting = $ref(false)
let isDirty = $ref(false)
let showDirtyConfirm = $ref(false)
let showResetConfirm = $ref(false)
let isEngineAvailable = $ref(true)
let selectedBinding = $ref<TemplateBinding | undefined>(undefined)

watch(() => open.value, async (isOpen) => {
  if (!isOpen) {
    showDirtyConfirm = false
    showResetConfirm = false
    return
  }

  isSwitching = false
  isResetting = false
  showDirtyConfirm = false
  showResetConfirm = false

  // Initial binding mirrors the project's current state so the dialog reflects reality.
  try {
    const config = await projectConfigCmds.readProjectConfig(props.game.path)
    selectedBinding = config?.template
  } catch {
    selectedBinding = undefined
  }

  if (props.game.engineId) {
    const engine = await db.engines.get(props.game.engineId)
    isEngineAvailable = !!engine && isEngineUsable(engine)
  } else {
    isEngineAvailable = true
  }

  isDirty = await templateSwitch.isTemplateDirty(props.game.path)
}, { immediate: true })

async function performSwitch(skipDirtyCheck: boolean) {
  isSwitching = true
  try {
    await templateSwitch.switchTemplate(props.game, selectedBinding, {
      skipDirtyCheck,
    })
    // Refresh workspace snapshot so the status bar and downstream modals see the new binding.
    if (workspaceStore.currentGame?.id === props.game.id) {
      await workspaceStore.refreshCurrentGameSnapshot()
    }
    open.value = false
  } catch (error) {
    handleError(error, { context: t('modals.switchTemplate.error') })
  } finally {
    isSwitching = false
  }
}

async function handleConfirm() {
  if (isSwitching || isResetting) {
    return
  }

  if (isDirty) {
    showDirtyConfirm = true
    return
  }

  await performSwitch(false)
}

async function handleDirtyConfirm() {
  showDirtyConfirm = false
  await performSwitch(true)
}

function handleResetRequest() {
  if (isSwitching || isResetting || !isDirty) {
    return
  }

  showResetConfirm = true
}

async function handleResetConfirm() {
  showResetConfirm = false
  if (isSwitching || isResetting || !isDirty) {
    return
  }

  isResetting = true
  try {
    await templateSwitch.resetTemplate(props.game.path)
    isDirty = false
  } catch (error) {
    handleError(error, { context: t('modals.switchTemplate.reset.error') })
  } finally {
    isResetting = false
  }
}
</script>

<template>
  <Dialog ::open="open">
    <DialogContent class="sm:max-w-[450px]" :hide-close="isSwitching || isResetting">
      <DialogHeader>
        <DialogTitle>
          {{ $t('modals.switchTemplate.title') }}
        </DialogTitle>
        <DialogDescription>
          {{ $t('modals.switchTemplate.selectTemplate') }}
        </DialogDescription>
      </DialogHeader>

      <div class="gap-4 grid">
        <div
          v-if="!isEngineAvailable"
          class="text-sm text-destructive p-3 border-destructive/50 rounded-md bg-destructive/10 flex gap-2 items-start"
          role="alert"
        >
          <TriangleAlert class="mt-0.5 shrink-0 size-4" />
          <span>{{ $t('modals.switchTemplate.engineUnavailable') }}</span>
        </div>

        <div class="px-2 gap-x-4 gap-y-2 grid grid-cols-[auto_1fr] items-center">
          <Label class="text-right whitespace-nowrap">
            {{ $t('modals.switchTemplate.templateLabel') }}
          </Label>
          <TemplateSelector
            ::="selectedBinding"
            :engine-id="props.game.engineId"
            :disabled="!isEngineAvailable"
          />
        </div>
      </div>

      <DialogFooter class="gap-3 sm:justify-between">
        <Button
          v-if="isDirty"
          variant="ghost"
          class="text-destructive hover:text-destructive hover:bg-destructive/10"
          :disabled="isSwitching || isResetting"
          @click="handleResetRequest"
        >
          <RotateCcw class="size-4" aria-hidden="true" />
          {{ $t('modals.switchTemplate.reset.label') }}
        </Button>
        <div class="flex gap-2">
          <DialogClose as-child>
            <Button variant="outline" :disabled="isSwitching || isResetting">
              {{ $t('common.cancel') }}
            </Button>
          </DialogClose>
          <Button :disabled="isSwitching || isResetting || !isEngineAvailable" @click="handleConfirm">
            {{ $t('common.save') }}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <AlertDialog ::open="showDirtyConfirm">
    <AlertDialogContent>
      <div class="flex flex-col gap-2 sm:flex-row sm:gap-4 max-sm:items-center">
        <div
          class="text-destructive rounded-lg bg-destructive/10 flex shrink-0 size-9 items-center justify-center"
          aria-hidden="true"
        >
          <TriangleAlert class="size-5" aria-hidden="true" />
        </div>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{ $t('modals.switchTemplate.dirtyConfirm.title') }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {{ $t('modals.switchTemplate.dirtyWarning') }}
          </AlertDialogDescription>
        </AlertDialogHeader>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>
          {{ $t('common.cancel') }}
        </AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          :disabled="isSwitching"
          @click="handleDirtyConfirm"
        >
          {{ $t('modals.switchTemplate.dirtyConfirm.confirm') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <AlertDialog ::open="showResetConfirm">
    <AlertDialogContent>
      <div class="flex flex-col gap-2 sm:flex-row sm:gap-4 max-sm:items-center">
        <div
          class="text-destructive rounded-lg bg-destructive/10 flex shrink-0 size-9 items-center justify-center"
          aria-hidden="true"
        >
          <TriangleAlert class="size-5" aria-hidden="true" />
        </div>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{ $t('modals.switchTemplate.reset.title') }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {{ $t('modals.switchTemplate.reset.description') }}
          </AlertDialogDescription>
        </AlertDialogHeader>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>
          {{ $t('common.cancel') }}
        </AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          :disabled="isResetting"
          @click="handleResetConfirm"
        >
          {{ $t('modals.switchTemplate.reset.confirm') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
