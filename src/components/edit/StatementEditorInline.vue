<script setup lang="ts">
import { isStatementInteractiveTarget, StatementUpdatePayload, StatementUpdateTarget, useStatementEditor } from '~/composables/useStatementEditor'
import { statementEditorSurfaceKey } from '~/helper/statement-editor/surface-context'
import { StatementEntry } from '~/helper/webgal-script/sentence'

const props = defineProps<{
  entry: StatementEntry
  /** 上一条 say 语句的说话人（用于 concat 占位符） */
  previousSpeaker?: string
  /** 更新目标定位，默认使用 entry.id 作为语句 id */
  updateTarget?: StatementUpdateTarget
}>()

provide(statementEditorSurfaceKey, 'inline')

const emit = defineEmits<{
  update: [payload: StatementUpdatePayload]
  openEffectEditor: []
}>()

const showInlineComment = defineModel<boolean>('showInlineComment', { default: false })

const {
  parsed,
  statementType,
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
  emitUpdate: payload => emit('update', payload),
  surface: 'inline',
})

const {
  effectiveSpeaker,
  speakerPlaceholder,
  narrationMode,
  handleSpeakerChange,
  toggleNarrationMode,
} = say

function handleBlankDblClick(e: MouseEvent) {
  if (isStatementInteractiveTarget(e.target)) {
    return
  }
  showInlineComment.value = true
}
</script>

<template>
  <div class="px-3 pb-2 flex flex-col gap-2" @dblclick="handleBlankDblClick">
    <!-- 空行 / 注释 -->
    <template v-if="statementType === 'empty' || statementType === 'comment'">
      <Input
        :model-value="parsed?.content ?? ''"
        :placeholder="$t('edit.visualEditor.placeholder.comment')"
        class="text-xs text-muted-foreground px-2.5 border-transparent h-6 shadow-none focus:text-foreground focus-visible:border-input"
        @update:model-value="misc.handleCommentChange(String($event ?? ''))"
      />
    </template>

    <!-- 不支持的命令：原始文本编辑 -->
    <template v-else-if="statementType === 'unsupported'">
      <Input
        :model-value="entry.rawText"
        class="text-xs font-mono px-2.5 flex-1 h-6 shadow-none"
        @update:model-value="misc.handleRawTextChange(String($event ?? ''))"
      />
    </template>

    <!-- 统一字段渲染（say + command） -->
    <div v-else-if="statementType === 'say' || statementType === 'command'" class="flex flex-wrap gap-x-3 gap-y-1.5 items-center">
      <div v-if="statementType === 'say'" class="@container flex flex-col gap-1.5 w-full">
        <InputGroup class="h-6 w-full shadow-none overflow-hidden @[16rem]:w-3/5 @[24rem]:w-2/5">
          <InputGroupInput
            :model-value="effectiveSpeaker"
            :placeholder="speakerPlaceholder"
            :disabled="narrationMode"
            class="text-xs pl-2.5 pr-0 h-6 shadow-none"
            @update:model-value="handleSpeakerChange(String($event ?? ''))"
          />
          <InputGroupAddon align="inline-end" class="pr-1.5">
            <InputGroupButton
              class="text-xs"
              :variant="narrationMode ? 'default' : 'ghost'"
              @click="toggleNarrationMode"
            >
              {{ $t('edit.visualEditor.narrationMode') }}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
      <Button
        v-if="statementType === 'command' && view.effectEditorAtTop.value"
        variant="outline"
        size="sm"
        class="btn-effect-editor px-2 h-6"
        @click="emit('openEffectEditor')"
      >
        <div class="i-lucide-sparkles size-3" />
        {{ $t('edit.visualEditor.effectEditor') }}
      </Button>
      <StatementSpecialContentEditor
        v-if="statementType === 'command' && view.specialContentMode.value"
        :mode="view.specialContentMode.value"
        surface="inline"
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
      <!-- Schema 参数（命令类型内联，排除高级参数） -->
      <template v-if="view.basicRenderFields.value.length > 0">
        <ParamRenderer
          v-bind="paramRenderer.sharedProps.value"
          :mode="statementType === 'say' ? 'all' : 'basic'"
          :fields="view.basicRenderFields.value"
          :custom-option-label="$t('edit.visualEditor.options.custom')"
          @update-value="paramRenderer.handleUpdateValue"
          @update-select="paramRenderer.handleUpdateSelect"
          @label-pointer-down="paramRenderer.handleLabelPointerDown"
        />
      </template>
      <Button
        v-if="statementType === 'command' && view.showEffectEditorButton.value && !view.effectEditorAtTop.value"
        variant="outline"
        size="sm"
        class="btn-effect-editor px-2 h-6"
        @click="emit('openEffectEditor')"
      >
        <div class="i-lucide-sparkles size-3" />
        {{ $t('edit.visualEditor.effectEditor') }}
      </Button>
    </div>

    <!-- 高级参数折叠区域 -->
    <Collapsible v-if="statementType === 'command' && hasVisibleAdvancedParams">
      <CollapsibleTrigger class="group/adv text-xs text-muted-foreground flex gap-1 cursor-pointer transition-colors items-center hover:text-foreground">
        <div class="i-lucide-chevron-right size-3 transition-transform group-data-[state=open]/adv:rotate-90" />
        {{ $t('edit.visualEditor.advancedParams') }}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div class="pt-1 flex flex-wrap gap-x-3 gap-y-1.5 items-center">
          <ParamRenderer
            v-bind="paramRenderer.sharedProps.value"
            mode="advanced"
            :fields="view.commandRenderFields.value"
            :custom-option-label="$t('edit.visualEditor.options.custom')"
            @update-value="paramRenderer.handleUpdateValue"
            @update-select="paramRenderer.handleUpdateSelect"
            @label-pointer-down="paramRenderer.handleLabelPointerDown"
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
    <!-- 行内注释（仅在存在时显示；注释和未识别语句不显示） -->
    <Input
      v-if="(parsed?.inlineComment || showInlineComment) && statementType !== 'empty' && statementType !== 'comment' && statementType !== 'unsupported'"
      :model-value="parsed?.inlineComment ?? ''"
      :placeholder="$t('edit.visualEditor.placeholder.comment')"
      class="text-xs text-muted-foreground px-2.5 border-transparent h-6 shadow-none focus:text-foreground focus-visible:border-input"
      @update:model-value="misc.handleInlineCommentChange(String($event ?? ''))"
    />
  </div>
</template>
