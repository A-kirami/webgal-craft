<script setup lang="ts">
import { useEffectEditorDialog } from '~/features/editor/effect-editor/useEffectEditorDialog'

interface Props {
  effectDialog: ReturnType<typeof useEffectEditorDialog>
}

const props = defineProps<Props>()
</script>

<template>
  <Dialog :open="props.effectDialog.isOpen" @update:open="val => { if (!val) props.effectDialog.requestClose() }">
    <DialogScrollContent class="max-w-102" @open-auto-focus.prevent>
      <DialogHeader>
        <DialogTitle>{{ $t('modals.effectEditor.title') }}</DialogTitle>
        <DialogDescription>
          {{ $t('modals.effectEditor.description') }}
        </DialogDescription>
      </DialogHeader>
      <div class="max-h-[50vh] min-h-60">
        <EffectEditorPanel
          :transform="props.effectDialog.draftTransform"
          :duration="props.effectDialog.draftDuration"
          :ease="props.effectDialog.draftEase"
          :can-apply="false"
          :can-reset="false"
          :show-footer="false"
          @update:transform="props.effectDialog.handleTransformUpdate"
          @update:duration="props.effectDialog.updateDuration"
          @update:ease="props.effectDialog.updateEase"
        />
      </div>
      <DialogFooter>
        <Button variant="outline" class="h-8" :disabled="props.effectDialog.isDefault" @click="props.effectDialog.resetToDefault">
          {{ $t('edit.visualEditor.commandPanel.resetDefaults') }}
        </Button>
        <Button class="h-8" @click="props.effectDialog.handleApply">
          {{ $t('common.confirm') }}
        </Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>
