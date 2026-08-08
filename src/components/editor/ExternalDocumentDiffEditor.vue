<script setup lang="ts">
import { ArrowRight, Check, ChevronDown, ChevronUp } from '@lucide/vue'
import * as monaco from 'monaco-editor'

import { colorMode } from '~/composables/color-mode'
import { applyDiffHunk } from '~/features/editor/external-document-conflict/diff-hunk'
import { resolveTextEditorLanguage } from '~/features/editor/text-editor/text-editor-language'
import { BASE_EDITOR_OPTIONS, THEME_DARK, THEME_LIGHT } from '~/plugins/editor'

import type { DocumentKind } from '~/domain/document/document-model'
import type { EngineRuntimeCapabilities } from '~/domain/engine/runtime-capabilities'

interface Props {
  externalContent: string
  kind: DocumentKind
  localContent: string
  path: string
  runtimeCapabilities?: Pick<EngineRuntimeCapabilities, 'sceneSemantics'>
}

const props = defineProps<Props>()
const emit = defineEmits<{
  apply: [content: string]
  back: []
}>()

let editorContainer = $ref<HTMLElement>()
let diffEditor = $shallowRef<monaco.editor.IStandaloneDiffEditor>()
let lineChanges = $ref<monaco.editor.ILineChange[]>([])
let currentChangeIndex = $ref(0)
let diffReady = $ref(false)
let pendingChangeLineNumber: number | undefined

const currentTheme = $computed(() => colorMode.value === 'dark' ? THEME_DARK : THEME_LIGHT)
const currentChange = $computed(() => lineChanges[currentChangeIndex])

function invalidateLineChanges(): void {
  pendingChangeLineNumber ??= currentChange?.modifiedStartLineNumber
  lineChanges = []
  diffReady = false
}

function syncLineChanges(): void {
  const changes = diffEditor?.getLineChanges()
  if (!changes) {
    invalidateLineChanges()
    return
  }

  lineChanges = changes
  const previousLineNumber = pendingChangeLineNumber
  const matchingIndex = previousLineNumber === undefined
    ? -1
    : lineChanges.findIndex(change => change.modifiedStartLineNumber === previousLineNumber)
  let closestIndex = matchingIndex

  if (closestIndex === -1 && previousLineNumber !== undefined) {
    let closestDistance = Number.POSITIVE_INFINITY
    for (const [index, change] of lineChanges.entries()) {
      const distance = Math.abs(change.modifiedStartLineNumber - previousLineNumber)
      if (distance < closestDistance) {
        closestIndex = index
        closestDistance = distance
      }
    }
  }

  currentChangeIndex = closestIndex === -1
    ? Math.min(currentChangeIndex, Math.max(0, lineChanges.length - 1))
    : closestIndex
  pendingChangeLineNumber = undefined
  diffReady = true
}

function selectChangeAtLine(side: 'original' | 'modified', lineNumber: number): void {
  const index = lineChanges.findIndex((change) => {
    const startLineNumber = side === 'original'
      ? change.originalStartLineNumber
      : change.modifiedStartLineNumber
    const endLineNumber = side === 'original'
      ? change.originalEndLineNumber
      : change.modifiedEndLineNumber

    if (endLineNumber === 0) {
      return lineNumber === Math.max(1, startLineNumber)
    }

    return lineNumber >= startLineNumber && lineNumber <= endLineNumber
  })

  if (index !== -1) {
    currentChangeIndex = index
  }
}

function revealCurrentChange(): void {
  if (!diffEditor || !currentChange) {
    return
  }

  const lineNumber = currentChange.modifiedEndLineNumber === 0
    ? Math.max(1, currentChange.modifiedStartLineNumber)
    : currentChange.modifiedStartLineNumber
  diffEditor.getModifiedEditor().revealLineInCenter(lineNumber)
}

function selectChange(index: number): void {
  if (lineChanges.length === 0) {
    return
  }

  currentChangeIndex = (index + lineChanges.length) % lineChanges.length
  revealCurrentChange()
}

function selectPreviousChange(): void {
  selectChange(currentChangeIndex - 1)
}

function selectNextChange(): void {
  selectChange(currentChangeIndex + 1)
}

function adoptLeftChange(): void {
  const model = diffEditor?.getModel()
  if (!model || !currentChange) {
    return
  }

  const nextContent = applyDiffHunk({
    sourceContent: model.original.getValue(),
    sourceRange: {
      startLineNumber: currentChange.originalStartLineNumber,
      endLineNumber: currentChange.originalEndLineNumber,
    },
    targetContent: model.modified.getValue(),
    targetRange: {
      startLineNumber: currentChange.modifiedStartLineNumber,
      endLineNumber: currentChange.modifiedEndLineNumber,
    },
    targetLineEnding: model.modified.getEOL(),
  })

  model.modified.pushEditOperations([], [{
    range: model.modified.getFullModelRange(),
    text: nextContent,
  // eslint-disable-next-line unicorn/no-null -- Monaco 通过 null 表示不恢复选区
  }], () => null)
}

function keepRightChange(): void {
  // 合并结果初始即为右侧内容，保留右侧只需继续审阅下一块。
  selectNextChange()
}

function applyMergeResult(): void {
  const content = diffEditor?.getModel()?.modified.getValue()
  if (content !== undefined) {
    emit('apply', content)
  }
}

function getModifiedEditor(): monaco.editor.IStandaloneCodeEditor | undefined {
  return diffEditor?.getModifiedEditor()
}

defineExpose({ getModifiedEditor })

function disposeDiffEditor(): void {
  if (!diffEditor) {
    return
  }

  const model = diffEditor.getModel()
  diffEditor.dispose()
  diffEditor = undefined
  model?.original.dispose()
  model?.modified.dispose()
}

function createDiffEditor(): void {
  if (!editorContainer || diffEditor) {
    return
  }

  const language = resolveTextEditorLanguage({
    kind: props.kind,
    path: props.path,
    runtimeCapabilities: props.runtimeCapabilities,
  }, monaco.languages.getLanguages())
  const editor = monaco.editor.createDiffEditor(editorContainer, {
    ...BASE_EDITOR_OPTIONS,
    automaticLayout: true,
    ignoreTrimWhitespace: false,
    minimap: { enabled: false },
    originalEditable: false,
    readOnly: false,
    renderMarginRevertIcon: false,
    renderSideBySide: true,
  })
  editor.setModel({
    original: monaco.editor.createModel(props.localContent, language),
    modified: monaco.editor.createModel(props.externalContent, language),
  })
  editor.onDidUpdateDiff(syncLineChanges)
  editor.getOriginalEditor().onDidChangeCursorPosition((event) => {
    selectChangeAtLine('original', event.position.lineNumber)
  })
  editor.getModifiedEditor().onDidChangeCursorPosition((event) => {
    selectChangeAtLine('modified', event.position.lineNumber)
  })
  editor.getModifiedEditor().onDidChangeModelContent(invalidateLineChanges)
  monaco.editor.setTheme(currentTheme)
  diffEditor = editor
  syncLineChanges()
}

watch(() => currentTheme, (theme) => {
  if (diffEditor) {
    monaco.editor.setTheme(theme)
  }
})

onMounted(createDiffEditor)
onBeforeUnmount(disposeDiffEditor)
</script>

<template>
  <div class="flex flex-1 flex-col gap-3 min-h-0">
    <div class="text-xs text-muted-foreground gap-3 grid grid-cols-2">
      <div class="px-3 py-2 border rounded-md bg-muted/40">
        <span class="text-foreground font-medium">{{ $t('modals.externalDocumentChange.diff.localVersion') }}</span>
        <span class="ml-2">{{ $t('modals.externalDocumentChange.diff.readOnly') }}</span>
      </div>
      <div class="px-3 py-2 border rounded-md bg-muted/40">
        <span class="text-foreground font-medium">{{ $t('modals.externalDocumentChange.diff.mergeResult') }}</span>
        <span class="ml-2">{{ $t('modals.externalDocumentChange.diff.editable') }}</span>
      </div>
    </div>

    <div class="border rounded-md flex flex-1 flex-col min-h-0 overflow-hidden">
      <div class="px-2 border-b bg-muted/30 flex gap-3 min-h-10 items-center justify-between">
        <div role="status" class="text-xs text-muted-foreground px-1">
          <template v-if="!diffReady">
            {{ $t('modals.externalDocumentChange.diff.computing') }}
          </template>
          <template v-else-if="lineChanges.length === 0">
            {{ $t('modals.externalDocumentChange.diff.noDifferences') }}
          </template>
          <template v-else>
            {{ $t('modals.externalDocumentChange.diff.changeStatus', {
              current: currentChangeIndex + 1,
              total: lineChanges.length,
            }) }}
          </template>
        </div>

        <div class="flex gap-1 items-center">
          <TooltipProvider :delay-duration="300">
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-7"
                  :disabled="lineChanges.length === 0"
                  :aria-label="$t('modals.externalDocumentChange.diff.previousChange')"
                  @click="selectPreviousChange"
                >
                  <ChevronUp class="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{{ $t('modals.externalDocumentChange.diff.previousChange') }}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-7"
                  :disabled="lineChanges.length === 0"
                  :aria-label="$t('modals.externalDocumentChange.diff.nextChange')"
                  @click="selectNextChange"
                >
                  <ChevronDown class="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{{ $t('modals.externalDocumentChange.diff.nextChange') }}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div class="mx-1 bg-border h-5 w-px" />
          <Button
            variant="outline"
            size="sm"
            :disabled="!currentChange"
            @click="adoptLeftChange"
          >
            <ArrowRight class="mr-1.5 size-4" />
            {{ $t('modals.externalDocumentChange.diff.useLeft') }}
          </Button>
          <Button
            variant="outline"
            size="sm"
            :disabled="!currentChange"
            @click="keepRightChange"
          >
            <Check class="mr-1.5 size-4" />
            {{ $t('modals.externalDocumentChange.diff.keepRight') }}
          </Button>
        </div>
      </div>
      <div ref="editorContainer" class="flex-1 min-h-0" />
    </div>

    <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="outline" @click="emit('back')">
        {{ $t('common.back') }}
      </Button>
      <Button @click="applyMergeResult">
        {{ $t('modals.externalDocumentChange.diff.applyResult') }}
      </Button>
    </div>
  </div>
</template>
