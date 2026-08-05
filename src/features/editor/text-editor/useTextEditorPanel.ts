import { useEditorStore } from '~/stores/editor'

import type { StatementUpdatePayload } from '../statement-editor/useStatementEditor'
import type * as monaco from 'monaco-editor'
import type { AbsPath } from '~/domain/path'

interface TextEditorPanelOptions {
  /** Monaco editor 实例 */
  editorRef: ShallowRef<monaco.editor.IStandaloneCodeEditor | undefined>
  /** 在真正写入 Monaco 前捕获历史前态 */
  captureBeforeContentChange?: () => void
  /** 当前文件路径 */
  getPath: () => AbsPath
}

/**
 * 文本模式下的表单回写桥。
 *
 * 核心职责：
 * - 将辅助面板表单编辑写回 Monaco model
 * - 在写回前捕获历史前态，交给统一文本事务链路处理
 */
export function useTextEditorPanel(options: TextEditorPanelOptions) {
  const {
    captureBeforeContentChange,
    editorRef,
    getPath,
  } = options
  const editorStore = useEditorStore()

  function readSelectedSceneLineNumber(): number | undefined {
    return editorStore.getSceneSelection(getPath())?.lastLineNumber
  }

  function resolveUpdateLineRange(
    payload: StatementUpdatePayload,
    editor: monaco.editor.IStandaloneCodeEditor,
    model: monaco.editor.ITextModel,
  ): { endLineNumber: number, startLineNumber: number } | undefined {
    if (payload.target?.kind === 'line') {
      const { lineNumber, endLineNumber } = payload.target
      if (
        !Number.isInteger(lineNumber)
        || !Number.isInteger(endLineNumber)
        || lineNumber < 1
        || endLineNumber < lineNumber
        || endLineNumber > model.getLineCount()
      ) {
        return undefined
      }
      return {
        endLineNumber,
        startLineNumber: lineNumber,
      }
    }

    const fallbackLineNumber = editor.getPosition()?.lineNumber
      ?? readSelectedSceneLineNumber()
    if (fallbackLineNumber === undefined) {
      return undefined
    }

    if (fallbackLineNumber < 1 || fallbackLineNumber > model.getLineCount()) {
      return undefined
    }

    return {
      endLineNumber: fallbackLineNumber,
      startLineNumber: fallbackLineNumber,
    }
  }

  /** 将表单编辑写回 Monaco，由文本事务链路统一同步状态 */
  function handleFormUpdate(payload: StatementUpdatePayload) {
    const editor = editorRef.value
    if (!editor) {
      return false
    }

    const model = editor.getModel()
    if (!model) {
      return false
    }

    const lineRange = resolveUpdateLineRange(payload, editor, model)
    if (lineRange === undefined) {
      return false
    }

    const currentText = Array.from(
      { length: lineRange.endLineNumber - lineRange.startLineNumber + 1 },
      (_, index) => model.getLineContent(lineRange.startLineNumber + index),
    ).join('\n')
    if (currentText === payload.rawText) {
      return false
    }

    captureBeforeContentChange?.()

    const range: monaco.IRange = {
      startLineNumber: lineRange.startLineNumber,
      startColumn: 1,
      endLineNumber: lineRange.endLineNumber,
      endColumn: model.getLineContent(lineRange.endLineNumber).length + 1,
    }

    model.pushEditOperations(
      editor.getSelections(),
      [{ range, text: payload.rawText }],
      // eslint-disable-next-line unicorn/no-null -- Monaco API 要求返回 null
      () => null,
    )
    return true
  }

  return {
    handleFormUpdate,
  }
}
