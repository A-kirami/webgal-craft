<script setup lang="ts">
import { useControlId } from '~/composables/useControlId'
import { useStatementAnimationEditorBridge } from '~/composables/useStatementAnimationEditorBridge'
import { isStatementInteractiveTarget, StatementUpdatePayload, StatementUpdateTarget, useStatementEditor } from '~/composables/useStatementEditor'
import { useStatementEffectEditorBridge } from '~/composables/useStatementEffectEditorBridge'
import {
  normalizeStatementPanelSingleLineValue,
  resolveStatementPanelPreviewImageUrl,
} from '~/helper/statement-editor/panel'
import { statementEditorSurfaceKey } from '~/helper/statement-editor/surface-context'
import { StatementEntry } from '~/helper/webgal-script/sentence'
import { useEditSettingsStore } from '~/stores/edit-settings'
import { useWorkspaceStore } from '~/stores/workspace'

const props = withDefaults(defineProps<{
  entry: StatementEntry
  /** 语句在列表中的序号（0-based） */
  index?: number
  /** 上一条 say 语句的说话人（用于 concat 占位符） */
  previousSpeaker?: string
  /** 是否启用标题点击定位当前语句 */
  enableFocusStatement?: boolean
  /** 更新与效果编辑器使用的目标定位 */
  updateTarget?: StatementUpdateTarget
  /** 是否显示标题栏 */
  showHeader?: boolean
  /** 内联模式 */
  inline?: boolean
}>(), {
  showHeader: true,
})

provide(statementEditorSurfaceKey, 'panel')

const emit = defineEmits<{
  focusStatement: []
  update: [payload: StatementUpdatePayload]
}>()

function emitUpdate(payload: StatementUpdatePayload) {
  emit('update', payload)
}

const {
  parsed,
  config,
  theme,
  commandLabel,
  statementType,
  contentField,
  resource,
  hasVisibleAdvancedParams,
  content,
  misc,
  say,
  view,
  paramRenderer,
} = useStatementEditor({
  entry: () => props.entry,
  updateTarget: () => props.updateTarget,
  previousSpeaker: () => props.previousSpeaker,
  emitUpdate,
  surface: 'panel',
})

const {
  effectiveSpeaker,
  speakerPlaceholder,
  narrationMode,
  handleSpeakerChange,
  toggleNarrationMode,
} = say

const showCommandFieldsSection = $computed(() => {
  const currentType = toValue(statementType)
  if (currentType === 'say') {
    return view.basicRenderFields.value.length > 0
  }
  if (currentType === 'command') {
    return view.basicRenderFields.value.length > 0
      || view.showEffectEditorButton.value
      || view.showAnimationEditorButton.value
      || !!view.specialContentMode.value
  }
  return false
})

const { openEffectEditor } = useStatementEffectEditorBridge({
  updateTarget: () => props.updateTarget,
  rawText: () => props.entry.rawText,
  parsed: () => parsed.value,
  emitUpdate,
})

const { openAnimationEditor } = useStatementAnimationEditorBridge({
  updateTarget: () => props.updateTarget,
  parsed: () => parsed.value,
  emitUpdate,
})

let showInlineComment = $ref(false)

watch(
  () => props.entry.id,
  () => {
    showInlineComment = !!parsed.value?.inlineComment
  },
  { immediate: true },
)

const editSettings = useEditSettingsStore()
const workspaceStore = useWorkspaceStore()

const previewImageUrl = $computed(() => resolveStatementPanelPreviewImageUrl({
  command: parsed.value?.command,
  content: parsed.value?.content,
  contentField: contentField.value,
  cwd: workspaceStore.CWD,
  fileRootPaths: resource.fileRootPaths.value,
  previewBaseUrl: workspaceStore.currentGameServeUrl,
  showSidebarAssetPreview: editSettings.showSidebarAssetPreview,
}))

function handleBlankDblClick(e: MouseEvent) {
  if (isStatementInteractiveTarget(e.target)) {
    return
  }
  showInlineComment = true
}

function handleSingleLineTextareaEnter(event: KeyboardEvent) {
  if (event.isComposing) {
    return
  }
  event.preventDefault()
}

function singleLine(handler: (value: string) => void) {
  return (value: string) => handler(normalizeStatementPanelSingleLineValue(value))
}

const handleSingleLineCommentChange = singleLine(misc.handleCommentChange)
const handleSingleLineRawTextChange = singleLine(misc.handleRawTextChange)
const handleSingleLineInlineCommentChange = singleLine(misc.handleInlineCommentChange)

function handleTitleClick() {
  if (!props.enableFocusStatement) {
    return
  }
  emit('focusStatement')
}

const { buildControlId } = useControlId('statement-panel')
const panelCommentContentInputId = buildControlId('comment-content')
const panelRawTextInputId = buildControlId('raw-text')
const panelSpeakerInputId = buildControlId('speaker')
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 固定头部 -->
    <div
      v-if="props.showHeader !== false"
      class="px-4 py-2.5 border-b flex shrink-0 gap-2 items-center"
      :class="props.enableFocusStatement ? 'cursor-pointer' : ''"
      @click="handleTitleClick"
    >
      <div
        class="rounded-full shrink-0 h-5 w-0.5"
        :class="`bg-gradient-to-b ${theme.gradient}`"
      />
      <div class="leading-0 p-1 rounded-md shrink-0" :class="[theme.bg, theme.text]">
        <div class="size-4" :class="config.icon" />
      </div>
      <span class="text-sm font-semibold">
        {{ commandLabel }}
      </span>
      <span class="text-sm text-muted-foreground ml-auto tabular-nums">#{{ index != null ? index + 1 : entry.id }}</span>
    </div>

    <!-- 可滚动参数区域 -->
    <ScrollArea v-if="!config.locked" class="flex-1" @dblclick="handleBlankDblClick">
      <div class="flex flex-col gap-3" :class="inline ? 'px-1 py-0' : 'p-4'">
        <!-- 资源图片预览 -->
        <StatementAssetPreview v-if="previewImageUrl" :src="previewImageUrl" />

        <!-- 空行 / 注释 -->
        <template v-if="statementType === 'empty' || statementType === 'comment'">
          <div class="flex flex-col gap-1">
            <Label :for="panelCommentContentInputId" class="text-xs text-muted-foreground font-medium w-fit">
              {{ $t('edit.visualEditor.params.commentContent') }}
            </Label>
            <Textarea
              :id="panelCommentContentInputId"
              :model-value="parsed?.content ?? ''"
              :placeholder="$t('edit.visualEditor.placeholder.comment')"
              class="text-xs py-1 flex-1 min-h-14.5 resize-none shadow-none field-sizing-content"
              @keydown.enter="handleSingleLineTextareaEnter"
              @update:model-value="handleSingleLineCommentChange(String($event ?? ''))"
            />
          </div>
        </template>

        <!-- 不支持的命令：原始文本编辑 -->
        <template v-else-if="statementType === 'unsupported'">
          <div class="flex flex-col gap-1">
            <Label :for="panelRawTextInputId" class="text-xs text-muted-foreground font-medium w-fit">
              {{ $t('edit.visualEditor.params.rawText') }}
            </Label>
            <Textarea
              :id="panelRawTextInputId"
              :model-value="entry.rawText"
              class="text-xs font-mono py-1 flex-1 min-h-14.5 resize-none shadow-none field-sizing-content"
              @keydown.enter="handleSingleLineTextareaEnter"
              @update:model-value="handleSingleLineRawTextChange(String($event ?? ''))"
            />
          </div>
        </template>

        <template v-if="statementType === 'say'">
          <div class="flex flex-col gap-1">
            <Label :for="panelSpeakerInputId" class="text-xs text-muted-foreground font-medium w-fit">
              {{ $t('edit.visualEditor.params.speaker') }}
            </Label>
            <InputGroup class="h-7 shadow-none overflow-hidden">
              <InputGroupInput
                :id="panelSpeakerInputId"
                :model-value="effectiveSpeaker"
                :placeholder="speakerPlaceholder"
                :disabled="narrationMode"
                class="text-xs py-1 pr-0 h-7 shadow-none"
                @update:model-value="handleSpeakerChange(String($event ?? ''))"
              />
              <InputGroupAddon align="inline-end" class="pr-1.5">
                <InputGroupButton
                  class="text-xs rounded-none h-7"
                  :variant="narrationMode ? 'default' : 'ghost'"
                  @click="toggleNarrationMode"
                >
                  {{ $t('edit.visualEditor.narrationMode') }}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </div>
        </template>

        <StatementCommandFieldsSection
          v-if="showCommandFieldsSection"
          surface="panel"
          :statement-type="statementType"
          :basic-render-fields="view.basicRenderFields.value"
          :special-content-mode="view.specialContentMode.value"
          :show-animation-editor-button="view.showAnimationEditorButton.value"
          :show-effect-editor-button="view.showEffectEditorButton.value"
          :effect-editor-at-top="view.effectEditorAtTop.value"
          :special-content="content.specialContent"
          :scene-root-path="resource.fileRootPaths.value.scene ?? ''"
          :param-renderer-shared-props="paramRenderer.sharedProps.value"
          :custom-option-label="$t('edit.visualEditor.options.custom')"
          :on-update-value="paramRenderer.handleUpdateValue"
          :on-update-select="paramRenderer.handleUpdateSelect"
          :on-label-pointer-down="paramRenderer.handleLabelPointerDown"
          :on-commit-slider="paramRenderer.handleCommitSlider"
          @open-animation-editor="openAnimationEditor"
          @open-effect-editor="openEffectEditor"
        />

        <!-- 高级参数折叠区域 -->
        <Collapsible v-if="statementType === 'command' && hasVisibleAdvancedParams">
          <CollapsibleTrigger class="group/adv text-xs text-muted-foreground flex gap-1 cursor-pointer transition-colors items-center hover:text-foreground">
            <div class="i-lucide-chevron-right size-3 transition-transform group-data-[state=open]/adv:rotate-90" />
            {{ $t('edit.visualEditor.advancedParams') }}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div class="pt-2 flex flex-wrap gap-x-4 gap-y-2.5">
              <ParamRenderer
                v-bind="paramRenderer.sharedProps.value"
                mode="advanced"
                :fields="view.commandRenderFields.value"
                :custom-option-label="$t('edit.visualEditor.options.custom')"
                @update-value="paramRenderer.handleUpdateValue"
                @update-select="paramRenderer.handleUpdateSelect"
                @label-pointer-down="paramRenderer.handleLabelPointerDown"
                @commit-slider="paramRenderer.handleCommitSlider"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
        <!-- 行内注释（仅在存在时显示；注释和未识别语句不显示） -->
        <FormItem v-if="(parsed?.inlineComment || showInlineComment) && statementType !== 'empty' && statementType !== 'comment' && statementType !== 'unsupported'" :label="$t('edit.visualEditor.types.comment')">
          <Textarea
            :model-value="parsed?.inlineComment ?? ''"
            :placeholder="$t('edit.visualEditor.placeholder.comment')"
            class="text-xs text-muted-foreground py-1 border-transparent min-h-14.5 resize-none shadow-none field-sizing-content focus:text-foreground focus-visible:border-input"
            @keydown.enter="handleSingleLineTextareaEnter"
            @update:model-value="handleSingleLineInlineCommentChange(String($event ?? ''))"
          />
        </FormItem>
      </div>
    </ScrollArea>

    <!-- 锁定语句：仅显示行内注释编辑 -->
    <div v-if="config.locked" class="p-4 flex-1" @dblclick="handleBlankDblClick">
      <FormItem v-if="parsed?.inlineComment || showInlineComment" :label="$t('edit.visualEditor.types.comment')">
        <Textarea
          :model-value="parsed?.inlineComment ?? ''"
          :placeholder="$t('edit.visualEditor.placeholder.comment')"
          class="text-xs text-muted-foreground py-1 border-transparent min-h-14.5 resize-none shadow-none field-sizing-content focus:text-foreground focus-visible:border-input"
          @keydown.enter="handleSingleLineTextareaEnter"
          @update:model-value="handleSingleLineInlineCommentChange(String($event ?? ''))"
        />
      </FormItem>
    </div>
  </div>
</template>
