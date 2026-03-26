import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { serializeCommandNode } from '~/domain/script/codec'
import { hasCommandNodeParam } from '~/domain/script/params'
import { readSentenceArgString, StatementEntry } from '~/domain/script/sentence'
import { CommandNode, SayCommandNode } from '~/domain/script/types'
import { updateCommandNodeSpeaker } from '~/domain/script/update'
import { StatementType } from '~/features/editor/statement-editor/useStatementMeta'

import type { arg, ISentence } from 'webgal-parser/src/interface/sceneInterface'

export interface UseStatementEditorSayOptions {
  entry: ComputedRef<StatementEntry>
  parsed: ComputedRef<ISentence | undefined>
  commandNode: ComputedRef<CommandNode | undefined>
  statementType: ComputedRef<StatementType>
  previousSpeaker: ComputedRef<string>
  emitUpdate: (patch: Partial<ISentence>) => void
}

/**
 * 说话人 / 旁白模式相关逻辑，从 useStatementEditor 提取。
 */
export function useStatementEditorSay(options: UseStatementEditorSayOptions) {
  const { t } = useI18n()

  const isNoColonStatement = computed(() => {
    return options.parsed.value?.command === commandType.say
      && !options.entry.value.rawText.includes(':')
  })

  const effectiveSpeaker = computed(() => {
    if (isNoColonStatement.value) {
      return ''
    }
    const sentence = options.parsed.value
    if (!sentence) {
      return ''
    }
    // 标准形式（say:内容 -speaker=角色）中 commandRaw 为 "say"，speaker 在 args 中
    if (sentence.commandRaw === 'say') {
      return readSentenceArgString(sentence, 'speaker')
    }
    // 简写形式（角色:内容）中 commandRaw 即为角色名
    return sentence.commandRaw
  })

  const narrationMode = ref(false)

  // 标准形式通过 -clear 参数标识旁白
  const isStandardForm = computed(() => options.parsed.value?.commandRaw === 'say')

  watchEffect(() => {
    if (options.statementType.value !== 'say' || isNoColonStatement.value) {
      narrationMode.value = false
      return
    }
    const node = options.commandNode.value
    narrationMode.value = node && node.type === commandType.say
      ? node.clear
      : effectiveSpeaker.value === ''
        && (options.parsed.value?.args.some((a: arg) => a.key === 'clear' && a.value === true) === true
          || options.parsed.value?.commandRaw === '')
  })

  const speakerPlaceholder = computed(() => {
    if (narrationMode.value) {
      return t('edit.visualEditor.types.narration')
    }
    if (isNoColonStatement.value) {
      return options.previousSpeaker.value || t('edit.visualEditor.types.narration')
    }
    const hasConcat = options.commandNode.value
      ? hasCommandNodeParam(options.commandNode.value, 'concat')
      : options.parsed.value?.args.some((a: arg) => a.key === 'concat' && a.value === true)
    if (hasConcat && options.previousSpeaker.value) {
      return options.previousSpeaker.value
    }
    // 标准形式 say 无 speaker 参数：继承上一个说话人
    if (isStandardForm.value && effectiveSpeaker.value === '' && options.previousSpeaker.value) {
      return options.previousSpeaker.value
    }
    return t('edit.visualEditor.placeholder.speaker')
  })

  function emitSpeakerUpdate(newSpeaker: string) {
    if (options.commandNode.value) {
      const updatedNode = updateCommandNodeSpeaker(options.commandNode.value, newSpeaker)
      if (updatedNode) {
        const updatedSentence = serializeCommandNode(updatedNode)
        options.emitUpdate({
          commandRaw: updatedSentence.commandRaw,
          content: updatedSentence.content,
          args: updatedSentence.args,
        })
        return
      }
    }
    options.emitUpdate({ commandRaw: newSpeaker })
  }

  function handleSpeakerChange(value: string | number) {
    emitSpeakerUpdate(String(value))
  }

  function toggleNarrationMode() {
    narrationMode.value = !narrationMode.value
    const node = options.commandNode.value
    if (!node || node.type !== commandType.say) {
      emitSpeakerUpdate('')
      return
    }

    // 通过 clear 字段和 speaker 切换旁白模式
    const updatedNode: SayCommandNode = narrationMode.value
      ? { ...node, speaker: '', clear: true }
      : { ...node, clear: false }
    const updatedSentence = serializeCommandNode(updatedNode)
    options.emitUpdate({
      commandRaw: updatedSentence.commandRaw,
      content: updatedSentence.content,
      args: updatedSentence.args,
    })
  }

  return {
    isNoColonStatement,
    effectiveSpeaker,
    narrationMode,
    speakerPlaceholder,
    handleSpeakerChange,
    toggleNarrationMode,
  }
}
