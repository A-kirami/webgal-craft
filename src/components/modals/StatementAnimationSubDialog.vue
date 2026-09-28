<script setup lang="ts">
import { useStatementAnimationDialog } from '~/features/editor/animation/useStatementAnimationDialog'
import { useShortcut } from '~/features/editor/shortcut/useShortcut'

interface Props {
  animationDialog: ReturnType<typeof useStatementAnimationDialog>
}

const props = defineProps<Props>()

// 模态宿主自己注册应用快捷键：只作用于本对话框的草稿，抽屉里那条同名绑定在模态打开时会被 isModalOpen 拦下
useShortcut({
  allowInInput: true,
  allowInModal: true,
  execute: () => {
    props.animationDialog.handleApply()
  },
  i18nKey: 'shortcut.animation.apply',
  id: 'animationDialog.apply',
  keys: 'Mod+Enter',
  when: { panelFocus: 'animationEditor' },
})
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
          :enable-history-shortcuts="false"
          :show-footer="false"
          @update:frames="props.animationDialog.updateFrames"
        />
      </div>
      <DialogFooter class="shrink-0">
        <Button variant="outline" @click="props.animationDialog.requestClose">
          {{ $t('common.cancel') }}
        </Button>
        <Button @click="props.animationDialog.handleApply">
          {{ $t('common.confirm') }}
        </Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>
