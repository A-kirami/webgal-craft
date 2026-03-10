import { SCRIPT_CONFIG } from 'webgal-parser/src/config/scriptConfig'

import type * as monaco from 'monaco-editor'

/** 所有已知命令关键字集合，用于纯文本判断 say 命令 */
const commandKeywords = new Set(SCRIPT_CONFIG.map(c => c.scriptString))

interface TextEditorPanelOptions {
  /** Monaco editor 实例 */
  editorRef: ShallowRef<monaco.editor.IStandaloneCodeEditor | undefined>
  /** 编辑器状态 */
  stateRef: Ref<{ lastLineNumber?: number, visualType?: string }>
  /** 是否为场景文件 */
  isScene: () => boolean
}

export function useTextEditorPanel(options: TextEditorPanelOptions) {
  const { editorRef, stateRef, isScene } = options

  const currentEntry = ref<StatementEntry | undefined>()
  const previousSpeaker = ref('')
  let isApplyingFormEdit = false
  let lastBuiltLineText = ''
  let lastBuiltLineNumber = -1
  let pendingUpdateTimer: ReturnType<typeof setTimeout> | undefined

  function clearEntry() {
    currentEntry.value = undefined
    previousSpeaker.value = ''
  }

  function buildEntry(lineNumber: number, lineText: string): StatementEntry {
    const entry: StatementEntry = {
      id: lineNumber,
      rawText: lineText,
      parsed: undefined,
      parseError: false,
      collapsed: false,
    }
    ensureParsed(entry)
    return entry
  }

  // 向上扫描查找最近的 say 语句说话人，用于无冒号语句的说话人继承显示。
  // 判断逻辑：冒号前的文本如果不是已知命令关键字，则视为说话人名称。
  // 冒号在行首（":xxx"）表示旁白，返回空字符串
  /** 向上扫描找到最近的 say 语句说话人，用于无冒号语句的说话人继承 */
  function findPreviousSpeaker(
    model: monaco.editor.ITextModel,
    lineNumber: number,
  ): string {
    for (let i = lineNumber - 1; i >= 1; i--) {
      const text = model.getLineContent(i)
      const colonIdx = text.indexOf(':')
      if (colonIdx === 0) {
        // :xxx; 格式，旁白
        return ''
      }
      if (colonIdx > 0) {
        const prefix = text.slice(0, colonIdx)
        if (!commandKeywords.has(prefix)) {
          return prefix
        }
      }
    }
    return ''
  }

  function updateFormEntry() {
    const editor = editorRef.value
    if (!editor || !isScene()) {
      clearEntry()
      return
    }

    const model = editor.getModel()
    if (!model) {
      clearEntry()
      return
    }

    // 优先从编辑器光标获取行号（回车等操作可能导致 state.lastLineNumber 未及时同步）
    const lineNumber = editor.getPosition()?.lineNumber ?? stateRef.value.lastLineNumber ?? 1
    if (lineNumber < 1 || lineNumber > model.getLineCount()) {
      clearEntry()
      return
    }

    const lineText = model.getLineContent(lineNumber)

    if (lineNumber === lastBuiltLineNumber && lineText === lastBuiltLineText) {
      return
    }

    lastBuiltLineNumber = lineNumber
    lastBuiltLineText = lineText

    if (!lineText.trim()) {
      clearEntry()
      return
    }

    currentEntry.value = buildEntry(lineNumber, lineText)
    previousSpeaker.value = findPreviousSpeaker(model, lineNumber)
  }

  function cancelPendingUpdate() {
    if (pendingUpdateTimer !== undefined) {
      clearTimeout(pendingUpdateTimer)
      pendingUpdateTimer = undefined
    }
  }

  /**
   * 延迟触发表单更新，让浏览器先完成光标绘制，
   * 避免复杂语句（如 Live2D changeFigure）的表单渲染阻塞光标移动。
   */
  function scheduleDeferredUpdate(invalidate: () => void) {
    if (isApplyingFormEdit) {
      return
    }
    invalidate()
    cancelPendingUpdate()
    pendingUpdateTimer = setTimeout(() => {
      pendingUpdateTimer = undefined
      updateFormEntry()
    }, 0)
  }

  function notifyCursorLineChanged() {
    scheduleDeferredUpdate(() => {
      lastBuiltLineNumber = -1
    })
  }

  function notifyContentChanged() {
    scheduleDeferredUpdate(() => {
      lastBuiltLineText = ''
    })
  }

  /** 将表单编辑写回 Monaco，同时抑制反向同步 */
  function handleFormUpdate(payload: { id: number, rawText: string }) {
    const editor = editorRef.value
    if (!editor) {
      return
    }

    const model = editor.getModel()
    if (!model) {
      return
    }

    const lineNumber = payload.id
    if (lineNumber < 1 || lineNumber > model.getLineCount()) {
      return
    }

    const currentLineText = model.getLineContent(lineNumber)
    if (currentLineText === payload.rawText) {
      return
    }

    cancelPendingUpdate()
    // isApplyingFormEdit 防止表单编辑写回 Monaco 后触发 onDidChangeModelContent，
    // 再反向同步回表单形成无限循环。
    // 使用 nextTick 而非同步重置，因为 Monaco 的 pushEditOperations 是同步的，
    // 但 Vue 的 watch 回调在 nextTick 后才执行
    isApplyingFormEdit = true

    const range: monaco.IRange = {
      startLineNumber: lineNumber,
      startColumn: 1,
      endLineNumber: lineNumber,
      endColumn: currentLineText.length + 1,
    }

    model.pushEditOperations(
      editor.getSelections(),
      [{ range, text: payload.rawText }],
      // eslint-disable-next-line unicorn/no-null -- Monaco API 要求返回 null
      () => null,
    )

    lastBuiltLineText = payload.rawText
    lastBuiltLineNumber = lineNumber
    currentEntry.value = buildEntry(lineNumber, payload.rawText)
    previousSpeaker.value = findPreviousSpeaker(model, lineNumber)

    nextTick(() => {
      isApplyingFormEdit = false
    })
  }

  function reset() {
    cancelPendingUpdate()
    clearEntry()
    lastBuiltLineText = ''
    lastBuiltLineNumber = -1
  }

  return {
    currentEntry,
    previousSpeaker,
    handleFormUpdate,
    notifyCursorLineChanged,
    notifyContentChanged,
    updateFormEntry,
    reset,
  }
}
