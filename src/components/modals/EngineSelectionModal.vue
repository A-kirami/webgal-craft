<script setup lang="ts">
import { usePreferenceStore } from '~/stores/preference'

import type { EngineRef } from '~/types/project-config'

let open = $(defineModel<boolean>('open'))

const props = defineProps<{
  gameName?: string
  hint?: EngineRef
  onCancel?: () => void
  onConfirm?: (engineId: string) => void
}>()

const { t } = useI18n()
const preferenceStore = usePreferenceStore()

let selectedEngineId = $ref<string>()
let settled = $ref(false)

const preferredEngineId = $computed(() => props.hint?.id ?? preferenceStore.defaultEngineId)

const description = $computed(() => {
  const gameName = props.gameName?.trim()
  return gameName
    ? t('game.selectEngineDescriptionWithName', { name: gameName })
    : t('game.selectEngineDescription')
})

function handleCancel() {
  if (settled) {
    return
  }

  settled = true
  open = false
  props.onCancel?.()
}

function handleConfirm() {
  if (!selectedEngineId || settled) {
    return
  }

  settled = true
  open = false
  props.onConfirm?.(selectedEngineId)
}

function handleDialogOpenChange(nextOpen: boolean) {
  if (!nextOpen) {
    handleCancel()
    return
  }

  open = nextOpen
}

watch($$(open), (isOpen) => {
  if (isOpen) {
    settled = false
    selectedEngineId = undefined
  }
})
</script>

<template>
  <Dialog :open="open" @update:open="handleDialogOpenChange">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>{{ $t('game.selectEngine') }}</DialogTitle>
        <DialogDescription>
          {{ description }}
        </DialogDescription>
      </DialogHeader>

      <div class="px-2 gap-x-4 gap-y-2 grid grid-cols-[auto_1fr] items-center">
        <Label class="text-right whitespace-nowrap">
          {{ $t('modals.createGame.gameEngine') }}
        </Label>
        <EngineSelector
          ::="selectedEngineId"
          :preferred-engine-id="preferredEngineId"
        />
      </div>

      <DialogFooter>
        <Button variant="outline" @click="handleCancel">
          {{ $t('common.cancel') }}
        </Button>
        <Button :disabled="!selectedEngineId" @click="handleConfirm">
          {{ $t('common.confirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
