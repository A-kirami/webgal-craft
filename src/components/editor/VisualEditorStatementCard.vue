<script setup lang="ts">
import { ensureParsed, StatementEntry } from '~/domain/script/sentence'
import { useStatementAnimationEditorBridge } from '~/features/editor/animation/useStatementAnimationEditorBridge'
import { useStatementEffectEditorBridge } from '~/features/editor/effect-editor/useStatementEffectEditorBridge'
import { buildStatementPreviewParams, StatementCardPreviewParam } from '~/features/editor/statement-editor/preview'
import { createStatementIdTarget, StatementUpdatePayload } from '~/features/editor/statement-editor/useStatementEditor'
import { useStatementFileMissing } from '~/features/editor/statement-editor/useStatementFileMissing'
import { provideStatementMeta } from '~/features/editor/statement-editor/useStatementMeta'

const props = defineProps<{
  entry: StatementEntry
  index: number
  playToDisabled?: boolean
  selected?: boolean
  readonly?: boolean
  /** 上一条 say 语句的说话人（用于 concat 占位符） */
  previousSpeaker?: string
}>()

const emit = defineEmits<{
  update: [payload: StatementUpdatePayload]
  select: [id: number]
  delete: [id: number]
  playTo: [id: number]
}>()

let collapsed = $(defineModel<boolean>('collapsed', { default: false }))

let showInlineComment = $ref(false)

watch(
  () => props.entry.id,
  () => {
    showInlineComment = !!ensureParsed(props.entry)?.inlineComment
  },
  { immediate: true },
)

/** Collapsible 折叠动画时长（ms），需与 CollapsibleContent CSS 动画保持同步 */
const COLLAPSE_ANIMATION_MS = 200

// 折叠动画结束后，重置空行内注释状态
watch(() => collapsed, (isCollapsed) => {
  if (isCollapsed && !ensureParsed(props.entry)?.inlineComment) {
    setTimeout(() => {
      showInlineComment = false
    }, COLLAPSE_ANIMATION_MS)
  }
})

const { parsed, config, contentField, argFields, theme, statementType, commandLabel } = provideStatementMeta(() => props.entry)

const { t } = useI18n()

const { fileMissingKeys } = useStatementFileMissing({
  parsed: () => parsed.value,
  contentField: () => contentField.value,
  argFields: () => argFields.value,
})

const previewParams = $computed<StatementCardPreviewParam[]>(() => buildStatementPreviewParams({
  parsed: parsed.value,
  statementType: statementType.value,
  entryRawText: props.entry.rawText,
  previousSpeaker: props.previousSpeaker,
  contentField: contentField.value,
  argFields: argFields.value,
  fileMissingKeys: fileMissingKeys.value,
  t,
}))

function handleCardClick() {
  emit('select', props.entry.id)
}

function handleCardDblClick() {
  if (!props.readonly && !config.value.locked) {
    collapsed = !collapsed
  }
}

const { openEffectEditor } = useStatementEffectEditorBridge({
  updateTarget: () => createStatementIdTarget(props.entry.id),
  rawText: () => props.entry.rawText,
  parsed: () => parsed.value,
  emitUpdate: payload => emit('update', payload),
})

const { openAnimationEditor } = useStatementAnimationEditorBridge({
  updateTarget: () => createStatementIdTarget(props.entry.id),
  parsed: () => parsed.value,
  emitUpdate: payload => emit('update', payload),
})

function paramBadgeClass(param: StatementCardPreviewParam): string {
  if (param.fileMissing) {
    return 'bg-destructive/10 text-destructive'
  }
  if (param.isEffect) {
    return 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
  }
  return 'bg-muted'
}
</script>

<template>
  <div class="relative">
    <div
      role="option"
      :aria-selected="selected"
      tabindex="-1"
      class="group px-3 py-1 border border-border rounded-lg bg-card transition-[border-color,background-color,box-shadow] duration-150 relative hover:border-primary/25 hover:shadow-sm"
      :class="{
        'border-primary/45 ring-1 ring-primary/20 shadow-sm': selected,
      }"
      @click="handleCardClick"
    >
      <!-- 命令头部 -->
      <div class="flex gap-2 items-center justify-between">
        <div class="flex gap-1 cursor-grab items-center active:cursor-grabbing">
          <!-- 拖拽手柄 -->
          <div class="i-lucide-grip-vertical text-muted-foreground opacity-40 size-4 transition-opacity group-hover:opacity-70" />
          <!-- 序号 -->
          <div class="text-xs text-muted-foreground/60 font-mono">
            {{ String(index + 1).padStart(2, '0') }}
          </div>
        </div>
        <div
          class="rounded-full shrink-0 h-5 w-0.5"
          :class="`bg-gradient-to-b ${theme.gradient}`"
        />

        <div class="flex flex-1 gap-2 items-center relative overflow-hidden" @dblclick.stop="handleCardDblClick">
          <div class="p-1 rounded-md shrink-0" :class="[theme.bg, theme.text]">
            <div class="size-4" :class="config.icon" />
          </div>
          <span class="text-sm font-semibold text-nowrap">{{ commandLabel }}</span>

          <!-- 锁定语句：行内注释速览 -->
          <span v-if="config.locked && parsed?.inlineComment" class="text-xs text-muted-foreground truncate">
            {{ parsed.inlineComment }}
          </span>

          <!-- 折叠参数速览 -->
          <div
            v-if="(collapsed || readonly) && !config.locked"
            class="text-xs text-muted-foreground px-1 flex gap-2 items-center overflow-hidden"
            un-after="h-full w-3 right-0 absolute from-card to-transparent bg-gradient-to-l content-empty"
          >
            <span
              v-for="(param, i) in previewParams"
              :key="i"
              class="rounded inline-flex text-nowrap items-center overflow-hidden animate-in animate-duration-200 animate-ease-out animate-backwards fade-in slide-in-from-left-1.5"
              :class="[
                paramBadgeClass(param),
                'shrink-0',
              ]"
              :style="{ animationDelay: `${i * 40}ms` }"
            >
              <span v-if="param.label" class="font-medium px-1.5 py-0.5" :class="param.fileMissing ? 'bg-destructive/15' : 'bg-muted-foreground/10'">{{ param.label }}</span>
              <span
                v-if="param.color"
                class="m-0.5 border border-foreground/10 rounded size-4"
                :style="{ backgroundColor: param.color }"
              />
              <template v-else-if="param.isEffect">
                <div v-if="param.effectIcon" class="ml-1.5 shrink-0 size-3" :class="param.effectIcon" />
                <span class="px-1 py-0.5" :class="param.effectIcon ? 'pl-0.5' : 'px-1.5'">{{ param.value }}</span>
              </template>
              <span v-else-if="param.value" class="px-1.5 py-0.5" :class="param.truncate && 'max-w-40 truncate'">{{ param.value }}</span>
            </span>
          </div>
        </div>

        <!-- 操作按钮组 -->
        <div class="gap-1 inline-grid grid-flow-col items-center">
          <slot name="actions" :collapsed="collapsed" :entry="entry">
            <Button
              variant="ghost"
              size="sm"
              class="p-0 opacity-60 h-7 w-0 transition-all overflow-hidden disabled:text-muted-foreground/50 hover:text-green-600 group-hover:p-1 disabled:opacity-100 hover:opacity-100 group-hover:w-7 disabled:cursor-not-allowed disabled:pointer-events-none"
              :disabled="playToDisabled"
              :title="$t('edit.visualEditor.playToLine')"
              @click.stop="emit('playTo', entry.id)"
            >
              <div class="i-lucide-play size-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="p-0 opacity-60 h-7 w-0 transition-all overflow-hidden hover:text-destructive group-hover:p-1 hover:opacity-100 group-hover:w-7"
              :title="$t('common.delete')"
              @click.stop="emit('delete', entry.id)"
            >
              <div class="i-lucide-trash-2 size-3" />
            </Button>

            <Button
              v-if="!readonly && !config.locked"
              variant="ghost"
              size="sm"
              class="p-1 opacity-60 size-7 transition-all hover:opacity-100"
              @click.stop="collapsed = !collapsed"
            >
              <div
                class="i-lucide-chevron-right size-3 transition-transform"
                :class="!collapsed && 'rotate-90'"
              />
            </Button>
          </slot>
        </div>
      </div>

      <!-- 展开态：内联编辑器 -->
      <Collapsible v-if="!readonly && !config.locked" :open="!collapsed">
        <CollapsibleContent>
          <Separator class="my-1.5" />
          <StatementEditorInline
            :entry="entry"
            :previous-speaker="previousSpeaker"
            :update-target="createStatementIdTarget(entry.id)"
            ::show-inline-comment="showInlineComment"
            @update="emit('update', $event)"
            @open-animation-editor="openAnimationEditor"
            @open-effect-editor="openEffectEditor"
          />
        </CollapsibleContent>
      </Collapsible>

      <!-- 左侧分类指示条 -->
      <div
        :class="`absolute left-0 inset-y-0 w-1 bg-gradient-to-b ${theme.gradient} rounded-l-lg m-0`"
      />
    </div>
  </div>
</template>
