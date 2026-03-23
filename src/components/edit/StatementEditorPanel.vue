<script setup lang="ts">
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { useControlId } from '~/composables/useControlId'
import { useStatementAnimationEditorBridge } from '~/composables/useStatementAnimationEditorBridge'
import { isStatementInteractiveTarget, StatementUpdatePayload, StatementUpdateTarget, useStatementEditor } from '~/composables/useStatementEditor'
import { useStatementEffectEditorBridge } from '~/composables/useStatementEffectEditorBridge'
import { getAssetUrl } from '~/helper/asset-url'
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

// ─── 资源预览 ───
const IMAGE_PREVIEW_COMMANDS = new Set([
  commandType.changeBg,
  commandType.changeFigure,
  commandType.miniAvatar,
  commandType.unlockCg,
])
const NON_IMAGE_EXTENSIONS = new Set(['.json', '.skel'])

const previewImageUrl = $computed(() => {
  if (!editSettings.showSidebarAssetPreview) {
    return ''
  }
  const cmd = parsed.value?.command
  if (!cmd || !IMAGE_PREVIEW_COMMANDS.has(cmd)) {
    return ''
  }
  const content = parsed.value?.content
  if (!content) {
    return ''
  }
  const ext = content.slice(content.lastIndexOf('.')).toLowerCase()
  if (NON_IMAGE_EXTENSIONS.has(ext)) {
    return ''
  }
  const field = contentField.value
  const assetType = field?.field.type === 'file' ? field.field.fileConfig.assetType : undefined
  const rootPath = assetType ? resource.fileRootPaths.value[assetType] : undefined
  if (!rootPath || !workspaceStore.CWD || !workspaceStore.currentGameServeUrl) {
    return ''
  }
  return getAssetUrl(`${rootPath}/${content}`)
})

function handleBlankDblClick(e: MouseEvent) {
  if (isStatementInteractiveTarget(e.target)) {
    return
  }
  showInlineComment = true
}

function normalizeSingleLineValue(value: string): string {
  return value.replaceAll(/\r?\n/g, ' ')
}

function handleSingleLineTextareaEnter(event: KeyboardEvent) {
  if (event.isComposing) {
    return
  }
  event.preventDefault()
}

function singleLine(handler: (value: string) => void) {
  return (value: string) => handler(normalizeSingleLineValue(value))
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

        <!-- 特殊 content 编辑器（仅 command） -->
        <template v-if="statementType === 'command' && view.specialContentMode.value">
          <StatementSpecialContentEditor
            :mode="view.specialContentMode.value"
            surface="panel"
            :set-var-content="content.specialContent.setVar.value"
            :choose-items="content.specialContent.choose.value"
            :style-rule-items="content.specialContent.styleRules.value"
            :scene-root-path="resource.fileRootPaths.value.scene ?? ''"
            @set-var-name="content.specialContent.handleSetVarNameChange"
            @set-var-value="content.specialContent.handleSetVarValueChange"
            @choose-name="content.specialContent.handleChooseNameChange($event.index, $event.value)"
            @choose-file="content.specialContent.handleChooseFileChange($event.index, $event.file)"
            @remove-choose="content.specialContent.handleRemoveChooseItem"
            @add-choose="content.specialContent.handleAddChooseItem"
            @style-old-name="content.specialContent.handleStyleOldNameChange($event.index, $event.value)"
            @style-new-name="content.specialContent.handleStyleNewNameChange($event.index, $event.value)"
            @remove-style-rule="content.specialContent.handleRemoveStyleRule"
            @add-style-rule="content.specialContent.handleAddStyleRule"
          />
        </template>

        <!-- Schema 定义的参数（非高级） -->
        <template v-if="(view.basicRenderFields.value.length > 0 && statementType !== 'empty' && statementType !== 'comment') || view.showEffectEditorButton.value || view.showAnimationEditorButton.value">
          <div class="flex flex-wrap gap-x-4 gap-y-2.5">
            <Button
              v-if="view.showAnimationEditorButton.value"
              variant="outline"
              size="sm"
              class="btn-animation-editor px-3 h-7 w-full justify-center"
              @click="openAnimationEditor"
            >
              <div class="i-lucide-clapperboard size-3" />
              {{ $t('edit.visualEditor.animation.title') }}
            </Button>
            <Button
              v-if="view.effectEditorAtTop.value"
              variant="outline"
              size="sm"
              class="btn-effect-editor px-3 h-7 w-full justify-center"
              @click="openEffectEditor"
            >
              <div class="i-lucide-sparkles size-3" />
              {{ $t('edit.visualEditor.effectEditor') }}
            </Button>
            <ParamRenderer
              v-if="view.basicRenderFields.value.length > 0 && statementType !== 'empty' && statementType !== 'comment'"
              v-bind="paramRenderer.sharedProps.value"
              mode="basic"
              :fields="view.basicRenderFields.value"
              :custom-option-label="$t('edit.visualEditor.options.custom')"
              @update-value="paramRenderer.handleUpdateValue"
              @update-select="paramRenderer.handleUpdateSelect"
              @label-pointer-down="paramRenderer.handleLabelPointerDown"
              @commit-slider="paramRenderer.handleCommitSlider"
            />
            <Button
              v-if="view.showEffectEditorButton.value && !view.effectEditorAtTop.value"
              variant="outline"
              size="sm"
              class="btn-effect-editor px-3 h-7 w-full justify-center"
              @click="openEffectEditor"
            >
              <div class="i-lucide-sparkles size-3" />
              {{ $t('edit.visualEditor.effectEditor') }}
            </Button>
          </div>
        </template>

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
