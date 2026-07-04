<script setup lang="ts">
import { ResizablePanel } from '~/components/ui/resizable'
import { useEditorPanelShell } from '~/features/editor/shell/useEditorPanelShell'
import { useShortcut } from '~/features/editor/shortcut/useShortcut'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'
import { TRANSFORM_OVERLAY_BRIDGE_KEY } from '~/features/editor/transform-overlay/context'

const commandPanelRef = useTemplateRef<InstanceType<typeof ResizablePanel>>('commandPanel')
const editorPanelRef = $(useTemplateRef('editorPanel'))
const { t } = useI18n()
const transformOverlayBridge = inject(TRANSFORM_OVERLAY_BRIDGE_KEY, undefined)
const EFFECT_EDITOR_INTERACTIVE_REGION_SELECTOR = '[data-effect-editor-interactive-region]'
const EFFECT_EDITOR_DISMISS_TOP_OFFSET = 28

interface EffectEditorDismissLayerSegment {
  height: number
  key: string
  style: Record<string, string>
  width?: number
}

interface EffectEditorInteractiveBounds {
  bottom: number
  left: number
  right: number
  top: number
}

const TRANSFORM_OVERLAY_FIELD_PATHS = new Set([
  'position.x',
  'position.y',
  'scale.x',
  'scale.y',
  'rotation',
])

let effectEditorInteractiveRegion = $ref<HTMLElement>()
let effectEditorInteractiveRect = $ref<DOMRectReadOnly>()

const {
  binding,
  closeEffectEditor,
  effectEditorProvider,
  effectEditorSession,
  effectiveShowSidebar,
  enableFocusStatement,
  handleEffectApply,
  handleEffectEditorSheetOpenChange,
  handleEffectReset,
  handleEffectTransformUpdate,
  handleInsertCommand,
  handleInsertGroup,
  isCommandPanelCollapsed,
  isCurrentSceneFile,
  isTextMode,
  selectedStatement,
  selectedStatementIndex,
  selectedStatementPreviousSpeaker,
  selectedStatementUpdateTarget,
  statementAnimationDialog,
  toggleCommandPanel,
} = useEditorPanelShell({
  commandPanelRef,
})

const canUseEffectEditorPreviewRegion = $computed(() => transformOverlayBridge?.enabled.value === true)

const effectEditorDismissLayerSegments = $computed<EffectEditorDismissLayerSegment[]>(() => {
  if (!effectEditorProvider.isOpen) {
    return []
  }

  if (!canUseEffectEditorPreviewRegion) {
    return [createFullEffectEditorDismissLayerSegment()]
  }

  const bounds = resolveEffectEditorInteractiveBounds(effectEditorInteractiveRect)
  if (!bounds) {
    return [createFullEffectEditorDismissLayerSegment()]
  }

  const { bottom, left, right, top } = bounds
  const segments: EffectEditorDismissLayerSegment[] = [
    {
      height: top - EFFECT_EDITOR_DISMISS_TOP_OFFSET,
      key: 'top',
      style: {
        height: `${top - EFFECT_EDITOR_DISMISS_TOP_OFFSET}px`,
        insetInline: '0',
        top: `${EFFECT_EDITOR_DISMISS_TOP_OFFSET}px`,
      },
      width: globalThis.innerWidth,
    },
    {
      height: bottom - top,
      key: 'left',
      style: {
        height: `${bottom - top}px`,
        left: '0',
        top: `${top}px`,
        width: `${left}px`,
      },
      width: left,
    },
    {
      height: bottom - top,
      key: 'right',
      style: {
        height: `${bottom - top}px`,
        left: `${right}px`,
        right: '0',
        top: `${top}px`,
      },
      width: globalThis.innerWidth - right,
    },
    {
      height: globalThis.innerHeight - bottom,
      key: 'bottom',
      style: {
        bottom: '0',
        insetInline: '0',
        top: `${bottom}px`,
      },
      width: globalThis.innerWidth,
    },
  ]

  return segments.filter(segment => segment.height > 0 && (segment.width ?? 1) > 0)
})

function createFullEffectEditorDismissLayerSegment(): EffectEditorDismissLayerSegment {
  return {
    height: globalThis.innerHeight - EFFECT_EDITOR_DISMISS_TOP_OFFSET,
    key: 'full',
    style: {
      inset: `${EFFECT_EDITOR_DISMISS_TOP_OFFSET}px 0 0 0`,
    },
    width: globalThis.innerWidth,
  }
}

function resolveEffectEditorInteractiveBounds(
  rect: DOMRectReadOnly | undefined,
): EffectEditorInteractiveBounds | undefined {
  if (!rect) {
    return undefined
  }

  const bounds = {
    bottom: Math.min(globalThis.innerHeight, rect.bottom),
    left: Math.max(0, rect.left),
    right: Math.min(globalThis.innerWidth, rect.right),
    top: Math.max(EFFECT_EDITOR_DISMISS_TOP_OFFSET, rect.top),
  }

  return bounds.right > bounds.left && bounds.bottom > bounds.top
    ? bounds
    : undefined
}

function updateEffectEditorInteractiveRegion(): void {
  if (!effectEditorProvider.isOpen) {
    effectEditorInteractiveRegion = undefined
    effectEditorInteractiveRect = undefined
    return
  }

  const region = document.querySelector<HTMLElement>(EFFECT_EDITOR_INTERACTIVE_REGION_SELECTOR) ?? undefined
  effectEditorInteractiveRegion = region
  effectEditorInteractiveRect = region?.getBoundingClientRect()
}

function handleEffectEditorTransformUpdate(payload: Parameters<typeof handleEffectTransformUpdate>[0]): void {
  if (transformOverlayBridge?.enabled.value) {
    transformOverlayBridge.handlePanelTransformUpdate(payload)
    return
  }

  handleEffectTransformUpdate(payload)
}

function getTransformOverlayFieldValue(path: string): string | undefined {
  if (!TRANSFORM_OVERLAY_FIELD_PATHS.has(path)) {
    return undefined
  }

  const displayTransform = transformOverlayBridge?.formDisplayTransform.value
  if (!displayTransform) {
    return undefined
  }

  switch (path) {
    case 'position.x': {
      return String(displayTransform.position.x)
    }
    case 'position.y': {
      return String(displayTransform.position.y)
    }
    case 'scale.x': {
      return String(displayTransform.scale.x)
    }
    case 'scale.y': {
      return String(displayTransform.scale.y)
    }
    case 'rotation': {
      return String(displayTransform.rotation)
    }
    default: {
      return undefined
    }
  }
}

useEventListener(globalThis, 'resize', updateEffectEditorInteractiveRegion)
useResizeObserver($$(effectEditorInteractiveRegion), updateEffectEditorInteractiveRegion)

watch(
  () => effectEditorProvider.isOpen,
  async (isOpen) => {
    if (!isOpen) {
      updateEffectEditorInteractiveRegion()
      return
    }

    await nextTick()
    updateEffectEditorInteractiveRegion()
  },
  { flush: 'post', immediate: true },
)

const sidebarEmptyText = $computed(() => (
  binding.value?.getEmptyState?.() === 'multiple-edit-targets'
    ? t('edit.textEditor.formPanel.multipleEditTargets')
    : (isTextMode.value
        ? t('edit.textEditor.formPanel.noStatement')
        : t('edit.visualEditor.noSelection'))
))

useShortcutContext({
  commandPanelOpen: computed(() => !isCommandPanelCollapsed.value),
  isModalOpen: computed(() => statementAnimationDialog.isOpen),
})

useShortcut({
  allowInInput: true,
  execute: () => {
    void handleEffectApply()
  },
  i18nKey: 'shortcut.effect.apply',
  id: 'effect.apply',
  keys: 'Mod+Enter',
  when: { panelFocus: 'effectEditor' },
})

useShortcut({
  execute: () => {
    void handleEffectApply()
  },
  i18nKey: 'shortcut.effect.apply',
  id: 'effect.applyFromTransformOverlay',
  keys: ['Enter', 'Mod+Enter'],
  when: { panelFocus: 'transformOverlay' },
})

useShortcut({
  allowInInput: true,
  execute: () => {
    void closeEffectEditor()
  },
  i18nKey: 'shortcut.effect.close',
  id: 'effect.close',
  keys: 'Escape',
  when: { panelFocus: 'effectEditor' },
})

defineExpose({ toggleCommandPanel })
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <div class="pr-4 border-b flex gap-2 items-center justify-between">
      <EditorTabs />
      <EditorToolbar />
    </div>
    <div ref="editorPanel" class="flex-1 min-h-0 relative overflow-hidden">
      <EditorSidebarLayout v-if="isCurrentSceneFile" ::show="effectiveShowSidebar" class="h-full">
        <div class="flex flex-col h-full relative overflow-hidden">
          <!-- 场景文件：编辑器 + 命令面板纵向分割 -->
          <ResizablePanelGroup auto-save-id="editor-vertical" direction="vertical" class="flex-1 min-h-0">
            <ResizablePanel size-unit="px" :min-size="200">
              <FileEditor />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel
              ref="commandPanel"
              collapsible
              size-unit="px"
              :default-size="135"
              :min-size="80"
            >
              <CommandPanel
                @insert-command="handleInsertCommand"
                @insert-group="handleInsertGroup"
              />
            </ResizablePanel>
          </ResizablePanelGroup>
          <!-- 命令面板折叠态：底部居中小标签 -->
          <button
            v-if="isCommandPanelCollapsed"
            class="text-xs text-muted-foreground px-3 py-0.5 border border-b-0 rounded-t bg-muted flex gap-1 transition-colors items-center bottom-0 left-1/2 justify-center absolute hover:text-foreground hover:bg-accent -translate-x-1/2"
            @click="toggleCommandPanel"
          >
            <div class="i-lucide-panel-bottom-open size-3.5" />
            {{ $t('edit.visualEditor.commandPanel.title') }}
          </button>
        </div>
        <template #sidebar>
          <div class="h-full">
            <StatementEditorPanel
              v-if="binding && selectedStatement"
              :entry="selectedStatement"
              :index="selectedStatementIndex"
              :previous-speaker="selectedStatementPreviousSpeaker"
              :update-target="selectedStatementUpdateTarget"
              :enable-focus-statement="enableFocusStatement"
              @update="binding.onUpdate"
              @focus-statement="binding.onFocusStatement?.()"
            />
            <div v-else-if="binding" class="text-sm text-muted-foreground px-4 flex h-full items-center justify-center">
              {{ sidebarEmptyText }}
            </div>
          </div>
        </template>
      </EditorSidebarLayout>
      <div v-else class="flex flex-col h-full relative overflow-hidden">
        <FileEditor class="flex-1 min-h-0" />
      </div>

      <Sheet :open="effectEditorProvider.isOpen" :modal="false" @update:open="handleEffectEditorSheetOpenChange">
        <div
          v-for="segment in effectEditorDismissLayerSegments"
          :key="segment.key"
          data-testid="effect-editor-dismiss-layer"
          class="fixed z-40"
          :style="segment.style"
          aria-hidden="true"
          @click="closeEffectEditor"
        />
        <SheetContent
          :to="editorPanelRef ?? undefined"
          :overlay="false"
          side="right"
          class="p-4 max-w-none w-108 absolute sm:max-w-none"
          @open-auto-focus.prevent
          @close-auto-focus.prevent
          @pointer-down-outside.prevent
          @interact-outside.prevent
        >
          <div class="flex flex-col h-full">
            <SheetHeader class="pr-8 gap-y-0.5">
              <SheetTitle class="text-base">
                {{ $t('modals.effectEditor.title') }}
              </SheetTitle>
              <SheetDescription class="text-13px!">
                {{ $t('modals.effectEditor.description') }}
              </SheetDescription>
            </SheetHeader>
            <Separator class="mb-4 mt-2" />
            <EffectEditorPanel
              v-if="effectEditorSession"
              class="flex-1 min-h-0"
              :transform="effectEditorSession.draft.transform"
              :baseline-source="effectEditorSession.baselineSource"
              :baseline-transform="effectEditorSession.baselineTransform"
              :preview-field-value="getTransformOverlayFieldValue"
              :duration="effectEditorSession.draft.duration"
              :ease="effectEditorSession.draft.ease"
              :can-apply="effectEditorProvider.canApply"
              :can-reset="effectEditorProvider.canReset"
              @update:transform="handleEffectEditorTransformUpdate"
              @update:duration="effectEditorProvider.updateDraft({ duration: $event })"
              @update:ease="effectEditorProvider.updateDraft({ ease: $event })"
              @preview="effectEditorProvider.requestPreview"
              @cancel-preview="effectEditorProvider.cancelPreview"
              @apply="handleEffectApply"
              @reset="handleEffectReset"
            />
          </div>
        </SheetContent>
      </Sheet>

      <StatementAnimationSubDialog :animation-dialog="statementAnimationDialog" />
    </div>
  </div>
</template>
