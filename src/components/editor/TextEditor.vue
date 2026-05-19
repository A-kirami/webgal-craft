<script setup lang="ts">
import * as monaco from 'monaco-editor'

import { colorMode } from '~/composables/color-mode'
import { useDragSession } from '~/composables/useDragSession'
import { useDroppableRegistry } from '~/composables/useDroppableRegistry'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'
import { buildTextEditorOptions } from '~/features/editor/text-editor/text-editor-options'
import { createTextEditorPlayToLineController } from '~/features/editor/text-editor/text-editor-play-to-line'
import { useTextEditorRuntime } from '~/features/editor/text-editor/useTextEditorRuntime'
import { BASE_EDITOR_OPTIONS, THEME_DARK, THEME_LIGHT } from '~/plugins/editor'
import { useEditSettingsStore } from '~/stores/edit-settings'
import { isEditableEditor, useEditorStore } from '~/stores/editor'
import { useTabsStore } from '~/stores/tabs'

import type { TextProjectionState } from '~/stores/editor'
import type { FileSystemDragPayload } from '~/types/drag-drop'

interface Props {
  state: TextProjectionState
}

const props = defineProps<Props>()
const editorStore = useEditorStore()
const tabsStore = useTabsStore()
const editSettings = useEditSettingsStore()
const dragSession = useDragSession()
const dropRegistry = useDroppableRegistry()
const { locale, t } = useI18n()
const showPlayToLineGlyph = $computed(() => props.state.kind === 'scene')
const disablePlayToLineGlyph = $computed(() => props.state.kind === 'scene' && props.state.isDirty)

const editorOptions = $computed<monaco.editor.IEditorConstructionOptions>(() =>
  ({
    ...buildTextEditorOptions(BASE_EDITOR_OPTIONS, {
      fontFamily: editSettings.fontFamily,
      fontSize: editSettings.fontSize,
      minimap: editSettings.minimap,
      wordWrap: editSettings.wordWrap,
    }),
    glyphMargin: showPlayToLineGlyph,
    lineNumbersMinChars: 3,
  }) as monaco.editor.IEditorConstructionOptions,
)

let editor = $shallowRef<monaco.editor.IStandaloneCodeEditor>()
let playToLineController = $shallowRef<ReturnType<typeof createTextEditorPlayToLineController>>()
let editorContainer = $ref<HTMLElement>()
let textDropTargetElement: HTMLElement | undefined
let hasPendingPlayToLineGlyphSync = false
const runtime = useTextEditorRuntime({
  editorRef: $$(editor),
  getState: () => props.state,
})

const currentTheme = $computed(() => colorMode.value === 'dark' ? THEME_DARK : THEME_LIGHT)
const isCurrentTextProjectionActive = $computed(() => {
  const currentState = editorStore.currentState
  return currentState !== undefined
    && isEditableEditor(currentState)
    && currentState.projection === 'text'
    && tabsStore.activeTab?.path === props.state.path
})

function syncPlayToLineGlyph() {
  playToLineController?.syncFromEditorPosition()
}

function readCurrentDragPosition() {
  return dragSession.state.value.currentPosition
}

function readCurrentFileDragPayload(): FileSystemDragPayload | undefined {
  const payload = dragSession.state.value.payload
  return payload?.type === 'file-system-item' ? payload : undefined
}

function unregisterTextDropTarget() {
  if (!textDropTargetElement) {
    return
  }

  dropRegistry.unregisterDroppable(textDropTargetElement)
  textDropTargetElement = undefined
}

function registerTextDropTarget() {
  if (!editorContainer) {
    unregisterTextDropTarget()
    return
  }

  if (textDropTargetElement === editorContainer) {
    return
  }

  unregisterTextDropTarget()
  textDropTargetElement = editorContainer
  dropRegistry.registerDroppable(editorContainer, {
    accept: 'file-system-item',
    canDrop(payload) {
      return payload.type === 'file-system-item'
        && runtime.canHandleFileDrop(payload, readCurrentDragPosition())
    },
    id: `text-editor:${props.state.path}`,
    onDragEnter(payload) {
      if (payload.type === 'file-system-item') {
        runtime.syncFileDropHover(payload, readCurrentDragPosition())
      }
    },
    onDragLeave(payload) {
      if (payload.type === 'file-system-item') {
        runtime.clearFileDropHover()
      }
    },
    onDrop(payload) {
      if (payload.type !== 'file-system-item') {
        return
      }

      const position = readCurrentDragPosition()
      if (!position) {
        runtime.clearFileDropHover()
        return
      }

      if (runtime.handleFileDrop(payload, position)) {
        editor?.focus()
      }
    },
  })
}

useShortcutContext({
  panelFocus: 'editor',
}, {
  target: () => editorContainer,
  trackFocus: true,
})

function schedulePlayToLineGlyphSync() {
  if (hasPendingPlayToLineGlyphSync) {
    return
  }

  hasPendingPlayToLineGlyphSync = true
  queueMicrotask(() => {
    hasPendingPlayToLineGlyphSync = false
    syncPlayToLineGlyph()
  })
}

function handleModelContentChange(event: monaco.editor.IModelContentChangedEvent) {
  runtime.handleContentChange(event)
  schedulePlayToLineGlyphSync()
}

function handleCursorPositionChange(event: monaco.editor.ICursorPositionChangedEvent) {
  runtime.handleCursorPositionChange(event)
  playToLineController?.syncDecorationsForLine(event.position.lineNumber)
}

function handleEditorMouseDown(event: monaco.editor.IEditorMouseEvent) {
  runtime.handleEditorClick()
  playToLineController?.handleMouseDown(event)
}

function createEditor() {
  if (!editorContainer || editor) {
    return
  }

  const initialModel = runtime.ensureModel()

  editor = monaco.editor.create(editorContainer, {
    model: initialModel,
    theme: currentTheme,
    automaticLayout: true,
    autoIndent: 'brackets',
    formatOnPaste: true,
    formatOnType: true,
    ...editorOptions,
  })

  playToLineController = createTextEditorPlayToLineController({
    editor,
    getHoverMessage: () => t('edit.visualEditor.playToLine'),
    getPath: () => props.state.path,
    glyphMarginTargetType: monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN,
    isEnabled: () => showPlayToLineGlyph,
    isDisabled: () => disablePlayToLineGlyph,
    syncScenePreview: (path, lineNumber, lineText, force) => {
      editorStore.syncScenePreview(path, lineNumber, lineText, force)
    },
  })

  editor.onDidChangeCursorPosition(handleCursorPositionChange)
  editor.onDidChangeCursorSelection(runtime.handleCursorSelectionChange)
  editor.onDidChangeModelContent(handleModelContentChange)
  editor.onDidScrollChange(runtime.handleScrollChange)
  editor.onMouseDown(handleEditorMouseDown)

  runtime.handleEditorCreated()
  syncPlayToLineGlyph()
}

watch(() => currentTheme, (newTheme) => {
  if (editor) {
    monaco.editor.setTheme(newTheme)
  }
})

watch(() => editorOptions, (newOptions) => {
  if (editor) {
    editor.updateOptions(newOptions)
  }
}, { deep: true })

watch(
  [
    () => props.state.kind,
    () => props.state.isDirty,
    () => props.state.path,
    () => locale.value,
  ],
  () => {
    syncPlayToLineGlyph()
  },
)

onMounted(() => {
  if (isCurrentTextProjectionActive) {
    createEditor()
  }
  registerTextDropTarget()
})

watch(() => isCurrentTextProjectionActive, (isActive) => {
  if (isActive) {
    createEditor()
  }
})

watch(() => props.state.path, () => {
  if (textDropTargetElement) {
    unregisterTextDropTarget()
    registerTextDropTarget()
  }
})

watch(() => dragSession.state.value.currentPosition, (position) => {
  if (dropRegistry.hoveredTarget.value !== editorContainer) {
    return
  }

  const payload = readCurrentFileDragPayload()
  if (payload) {
    runtime.syncFileDropHover(payload, position)
  }
})

onUnmounted(() => {
  runtime.clearFileDropHover()
  unregisterTextDropTarget()

  if (editor) {
    playToLineController?.dispose()
    playToLineController = undefined
    runtime.handleBeforeUnmount()

    editor.dispose()
    editor = undefined
  }
})
</script>

<template>
  <div ref="editorContainer" class="h-full overflow-hidden" />
</template>

<style>
.monaco-editor .glyph-margin-widgets .cgmr.play-to-line-glyph {
  @apply cursor-pointer text-green-600 dark:text-green-400;
}

.monaco-editor .glyph-margin-widgets .cgmr.play-to-line-glyph::before {
  @apply content-empty block size-4 flex-none i-lucide-play;
}

.monaco-editor .glyph-margin-widgets .cgmr.play-to-line-glyph.play-to-line-glyph-disabled {
  @apply cursor-not-allowed text-muted-foreground/50;
}

.monaco-editor.vs .text-editor-drop-caret,
.monaco-editor.hc-light .text-editor-drop-caret {
  border-right: 2px dotted #000000;
}

.monaco-editor.vs-dark .text-editor-drop-caret {
  border-right: 2px dotted #aeafad;
}

.monaco-editor.hc-black .text-editor-drop-caret {
  border-right: 2px dotted #ffffff;
}

</style>
