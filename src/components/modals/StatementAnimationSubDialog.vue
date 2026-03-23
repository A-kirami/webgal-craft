<script setup lang="ts">
import { useStatementAnimationDialog } from '~/composables/useStatementAnimationDialog'

interface Props {
  animationDialog: ReturnType<typeof useStatementAnimationDialog>
}

const props = defineProps<Props>()
</script>

<template>
  <Dialog :open="props.animationDialog.isOpen" @update:open="val => { if (!val) props.animationDialog.requestClose() }">
    <DialogScrollContent
      class="grid-rows-[auto_minmax(0,1fr)_auto] max-h-90vh 2xl:(h-180 max-w-240) md:(h-140 max-w-180) xl:(h-150 max-w-200)"
    >
      <DialogHeader>
        <DialogTitle>{{ $t('edit.visualEditor.animation.title') }}</DialogTitle>
        <DialogDescription>
          {{ $t('edit.visualEditor.animation.description') }}
        </DialogDescription>
      </DialogHeader>
      <div class="h-full min-h-0 overflow-hidden">
        <StatementAnimationEditorPanel
          :frames="props.animationDialog.draftFrames"
          @update:frames="props.animationDialog.updateFrames"
        />
      </div>
      <DialogFooter class="shrink-0">
        <Button variant="outline" class="h-8" @click="props.animationDialog.requestClose">
          {{ $t('common.cancel') }}
        </Button>
        <Button class="h-8" @click="props.animationDialog.handleApply">
          {{ $t('common.confirm') }}
        </Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>
