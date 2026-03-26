import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { ensureParsed, StatementEntry } from '~/domain/script/sentence'
import { categoryTheme, isCommandSupported, readCommandConfig } from '~/features/editor/command-registry/index'
import { deriveArgFieldsFromEditorFields, readEditorFields, resolveI18n } from '~/features/editor/command-registry/schema'

export type StatementType = 'empty' | 'comment' | 'say' | 'command' | 'unsupported'

export type StatementMetaReturn = ReturnType<typeof useStatementMeta>

/** 卡片 provide → 内嵌编辑器 inject，避免同一条语句重复实例化派生链 */
export const statementMetaKey: InjectionKey<StatementMetaReturn> = Symbol('statement-meta')

export function provideStatementMeta(entry: MaybeRefOrGetter<StatementEntry>): StatementMetaReturn {
  const meta = useStatementMeta(entry)
  provide(statementMetaKey, meta)
  return meta
}

/**
 * 从 StatementEntry 派生只读元信息（parsed / config / fields / theme / type / label）。
 * 供 VisualEditorStatementCard（轻量速览）和 useStatementEditor（完整编辑）共用，
 * 避免两处重复计算同一条派生链。
 */
export function useStatementMeta(entry: MaybeRefOrGetter<StatementEntry>) {
  const { t } = useI18n()

  const entryRef = computed(() => toValue(entry))
  const parsed = computed(() => ensureParsed(entryRef.value))
  const config = computed(() => readCommandConfig(parsed.value?.command))
  const editorFields = computed(() => readEditorFields(config.value))
  const argFields = computed(() => deriveArgFieldsFromEditorFields(editorFields.value))
  const contentField = computed(() => editorFields.value.find(field => field.storage === 'content'))
  const theme = computed(() => categoryTheme[config.value.category])

  const statementType = computed<StatementType>(() => {
    if (!entryRef.value.rawText.trim()) {
      return 'empty'
    }
    if (!parsed.value) {
      return 'command'
    }
    if (!isCommandSupported(parsed.value.command)) {
      return 'unsupported'
    }
    if (parsed.value.command === commandType.comment) {
      return 'comment'
    }
    if (parsed.value.command === commandType.say) {
      return 'say'
    }
    return 'command'
  })

  const commandLabel = computed(() => {
    return resolveI18n(config.value.label, t, parsed.value?.content)
  })

  return {
    parsed,
    config,
    editorFields,
    argFields,
    contentField,
    theme,
    statementType,
    commandLabel,
  }
}
