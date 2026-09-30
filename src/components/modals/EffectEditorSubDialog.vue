<script setup lang="ts">
import { useEffectEditorDialog } from '~/features/editor/effect-editor/useEffectEditorDialog'
import { useEffectEditorDialogShortcuts } from '~/features/editor/effect-editor/useEffectEditorDialogShortcuts'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'

interface Props {
  effectDialog: ReturnType<typeof useEffectEditorDialog>
}

const props = defineProps<Props>()

const scrollContentRef = useTemplateRef<InstanceType<typeof DialogScrollContent>>('scrollContentRef')
const panelWrapperRef = useTemplateRef<HTMLElement>('panelWrapperRef')

// 嵌套对话框挂载当次调用 focus() 不生效（外层模态的焦点作用域仍在接管），要等提交结束后再聚焦。
// 焦点落在面板本身而不是第一个输入框上，这样只在非输入态生效的快捷键（复制、翻转）才能和抽屉里一样开箱可用。
watch(() => props.effectDialog.isOpen, async (isOpen) => {
  if (!isOpen) {
    return
  }

  await nextTick()
  panelWrapperRef.value?.focus({ preventScroll: true })
})

// 模态宿主自己接管焦点上下文与快捷键：这里编辑的是本对话框的草稿，与抽屉里的效果编辑器互不影响
useShortcutContext({
  panelFocus: 'effectEditor',
}, {
  active: () => props.effectDialog.isOpen,
  target: () => scrollContentRef.value?.contentElement,
  trackFocus: true,
})

useEffectEditorDialogShortcuts(props.effectDialog)
</script>

<template>
  <Dialog :open="props.effectDialog.isOpen" @update:open="val => { if (!val) props.effectDialog.requestClose() }">
    <DialogScrollContent ref="scrollContentRef" class="max-w-120" @open-auto-focus.prevent>
      <DialogHeader>
        <DialogTitle>{{ $t('modals.effectEditor.title') }}</DialogTitle>
        <DialogDescription>
          {{ $t('modals.effectEditor.description') }}
        </DialogDescription>
      </DialogHeader>
      <div ref="panelWrapperRef" tabindex="-1" class="outline-none max-h-[50vh] min-h-60">
        <EffectEditorPanel
          :transform="props.effectDialog.draftTransform"
          :duration="props.effectDialog.draftDuration"
          :ease="props.effectDialog.draftEase"
          :can-apply="false"
          :can-clear="false"
          :show-footer="false"
          @update:transform="props.effectDialog.handleTransformUpdate"
          @update:duration="props.effectDialog.updateDuration"
          @update:ease="props.effectDialog.updateEase"
        />
      </div>
      <DialogFooter>
        <Button variant="outline" :disabled="props.effectDialog.isDefault" @click="props.effectDialog.resetToDefault">
          {{ $t('edit.visualEditor.commandPanel.resetDefaults') }}
        </Button>
        <Button @click="props.effectDialog.handleApply">
          {{ $t('common.confirm') }}
        </Button>
      </DialogFooter>
    </DialogScrollContent>
  </Dialog>
</template>
