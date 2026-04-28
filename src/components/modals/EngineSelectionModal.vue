<script setup lang="ts">
import type { EngineRef } from '~/types/project-config'

let open = $(defineModel<boolean>('open'))

const props = defineProps<{
  hint?: EngineRef
  onCancel?: () => void
  onConfirm?: (engineId: string) => void
}>()

let selectedEngineId = $ref<string>()
let settled = $ref(false)

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
  }
})
</script>

<template>
  <Dialog :open="open" @update:open="handleDialogOpenChange">
    <DialogContent class="sm:max-w-[440px]">
      <DialogHeader>
        <DialogTitle>{{ $t('game.selectEngine') }}</DialogTitle>
        <DialogDescription>
          {{ $t('game.selectEngineDescription') }}
        </DialogDescription>
      </DialogHeader>

      <EngineSelector v-model="selectedEngineId" :preferred-engine-id="hint?.id" />

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
