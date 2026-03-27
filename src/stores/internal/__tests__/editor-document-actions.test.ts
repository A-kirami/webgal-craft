import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import { createDocumentModel } from '~/domain/document/document-model'

import {
  applyAnimationFrameInsert,
  applyAnimationFrameUpdate,
  applySceneStatementReorder,
  applyTextDocumentContent,
  redoDocument,
  undoDocument,
} from '../editor-document-actions'
import { createDocumentState } from '../editor-document-state'

import type { EditorDocumentActionContext } from '../editor-document-actions'
import type { DocumentState } from '../editor-document-state'
import type { TextProjectionState } from '../editor-session'
import type { SceneSelectionState } from '~/domain/document/scene-selection'
import type { AnimationFrame } from '~/domain/stage/types'

const DOC_PATH = '/game/docs/document.txt'

const { loggerWarnMock } = vi.hoisted(() => ({
  loggerWarnMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  warn: loggerWarnMock,
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  attachConsole: vi.fn(),
}))

function createTextProjectionState(): TextProjectionState {
  return {
    path: DOC_PATH,
    isDirty: false,
    projection: 'text',
    kind: 'plaintext',
    textContent: 'hello',
    textSource: 'projection',
    syncError: undefined,
  }
}

function createActionHarness() {
  const document: DocumentState = createDocumentState(createDocumentModel({
    kind: 'plaintext',
    content: 'hello',
  }))
  const textState = createTextProjectionState()
  let sceneSelection: SceneSelectionState | undefined
  const syncStateFromDocument = vi.fn()

  const context = {
    getDocumentState(path: string) {
      return path === DOC_PATH ? document : undefined
    },
    getSceneSelection(path: string) {
      return path === DOC_PATH ? sceneSelection : undefined
    },
    getTextProjectionState(path: string) {
      return path === DOC_PATH ? textState : undefined
    },
    patchSceneSelection(path: string, patch: Partial<SceneSelectionState>) {
      if (path !== DOC_PATH) {
        return
      }

      sceneSelection ??= {}
      Object.assign(sceneSelection, patch)
    },
    syncStateFromDocument,
  } satisfies EditorDocumentActionContext

  return {
    context,
    document,
    syncStateFromDocument,
  }
}

function createAnimationActionHarness() {
  const animationPath = '/game/animation/document.json'
  const document: DocumentState = createDocumentState(createDocumentModel({
    kind: 'animation',
    content: '[{"duration":100}]',
  }), '[{"duration":100}]')
  const textState: TextProjectionState = {
    path: animationPath,
    isDirty: false,
    projection: 'text',
    kind: 'animation',
    textContent: '[{"duration":100}]',
    textSource: 'draft',
    syncError: undefined,
  }
  const syncStateFromDocument = vi.fn()
  const context = {
    getDocumentState(path: string) {
      return path === animationPath ? document : undefined
    },
    getSceneSelection(_path: string): SceneSelectionState | undefined {
      return
    },
    getTextProjectionState(path: string) {
      return path === animationPath ? textState : undefined
    },
    patchSceneSelection() { /* no-op */ },
    syncStateFromDocument,
  } satisfies EditorDocumentActionContext

  return {
    animationPath,
    context,
    document,
    syncStateFromDocument,
    textState,
  }
}

function createSceneActionHarness() {
  const scenePath = '/game/scene/document.txt'
  const document: DocumentState = createDocumentState(createDocumentModel({
    kind: 'scene',
    content: 'alpha\nbeta\ngamma',
  }))
  let sceneSelection: SceneSelectionState | undefined = {
    lastEditedStatementId: document.model.kind === 'scene' ? document.model.statements[1]?.id : undefined,
    lastLineNumber: 2,
    selectedStatementId: document.model.kind === 'scene' ? document.model.statements[1]?.id : undefined,
  }
  const syncStateFromDocument = vi.fn()

  const context = {
    getDocumentState(path: string) {
      return path === scenePath ? document : undefined
    },
    getSceneSelection(path: string) {
      return path === scenePath ? sceneSelection : undefined
    },
    getTextProjectionState(_path: string): TextProjectionState | undefined {
      return
    },
    patchSceneSelection(path: string, patch: Partial<SceneSelectionState>) {
      if (path !== scenePath) {
        return
      }

      sceneSelection ??= {}
      Object.assign(sceneSelection, patch)
    },
    syncStateFromDocument,
  } satisfies EditorDocumentActionContext

  return {
    context,
    document,
    readSceneSelection: () => sceneSelection,
    scenePath,
    syncStateFromDocument,
  }
}

describe('编辑器文档动作的历史回滚', () => {
  beforeEach(() => {
    loggerWarnMock.mockReset()
  })

  it('逆事务无法应用时恢复 undo 历史', () => {
    const { context, document, syncStateFromDocument } = createActionHarness()

    document.engine.commit(
      { type: 'replace-all', content: 'world' },
      { type: 'statement:update', id: 1, rawText: 'broken' },
      'text',
    )

    const result = undoDocument(context, DOC_PATH)

    expect(result.applied).toBe(false)
    expect(document.engine.sequenceNumber).toBe(1)
    expect(document.engine.canUndo).toBe(true)
    expect(document.engine.canRedo).toBe(false)
    expect(syncStateFromDocument).not.toHaveBeenCalled()
  })

  it('正向事务无法应用时恢复 redo 历史', () => {
    const { context, document, syncStateFromDocument } = createActionHarness()

    document.engine.commit(
      { type: 'statement:update', id: 1, rawText: 'broken' },
      { type: 'replace-all', content: 'hello' },
      'text',
    )
    document.engine.undo()

    const result = redoDocument(context, DOC_PATH)

    expect(result.applied).toBe(false)
    expect(document.engine.sequenceNumber).toBe(0)
    expect(document.engine.canUndo).toBe(false)
    expect(document.engine.canRedo).toBe(true)
    expect(syncStateFromDocument).not.toHaveBeenCalled()
  })

  it('拒绝对动画文档执行 text:set-content 以保持仅草稿流程', () => {
    const { animationPath, context, document, syncStateFromDocument, textState } = createAnimationActionHarness()

    applyTextDocumentContent(context, animationPath, '[{"duration":200}]')

    expect(document.model.kind).toBe('animation')
    if (document.model.kind !== 'animation') {
      throw new TypeError('expected animation document model')
    }
    expect(document.model.frames[0]).toMatchObject({ duration: 100 })
    expect(document.cachedTextContent).toBe('[\n  {\n    "duration": 100\n  }\n]')
    expect(document.engine.sequenceNumber).toBe(0)
    expect(syncStateFromDocument).not.toHaveBeenCalled()
    expect(textState.textContent).toBe('[{"duration":100}]')
    expect(loggerWarnMock).toHaveBeenCalledWith(`事务应用失败 (${animationPath}): text:set-content`)
  })

  it('在撤销重做时从 replace-all 历史恢复动画草稿文本', () => {
    const { animationPath, context, document, syncStateFromDocument, textState } = createAnimationActionHarness()

    document.model = createDocumentModel({
      kind: 'animation',
      content: '[{"duration":200}]',
    })
    textState.textContent = '[{"duration":200}]'
    document.engine.commit(
      { type: 'replace-all', content: '[{"duration":200}]' },
      { type: 'replace-all', content: '[{"duration":100}]' },
      'text',
    )

    const undoResult = undoDocument(context, animationPath)

    expect(undoResult.applied).toBe(true)
    expect(syncStateFromDocument).toHaveBeenCalledTimes(1)
    expect(textState.textContent).toBe('[{"duration":100}]')
    expect(textState.textSource).toBe('draft')
    expect(textState.syncError).toBeUndefined()
    expect(document.model.kind).toBe('animation')
    if (document.model.kind !== 'animation') {
      throw new TypeError('expected animation document model')
    }
    expect(document.model.frames[0]).toMatchObject({ duration: 100 })

    const redoResult = redoDocument(context, animationPath)

    expect(redoResult.applied).toBe(true)
    expect(syncStateFromDocument).toHaveBeenCalledTimes(2)
    expect(textState.textContent).toBe('[{"duration":200}]')
    expect(textState.textSource).toBe('draft')
    expect(textState.syncError).toBeUndefined()
    expect(document.model.frames[0]).toMatchObject({ duration: 200 })
  })

  it('将非法动画 replace-all 历史视为撤销失败且不暴露解析异常', () => {
    const { animationPath, context, document, syncStateFromDocument, textState } = createAnimationActionHarness()

    document.engine.commit(
      { type: 'replace-all', content: '[{"duration":200}]' },
      { type: 'replace-all', content: '[{"duration":100}]x' },
      'text',
    )

    const result = undoDocument(context, animationPath)

    expect(result.applied).toBe(false)
    expect(document.engine.sequenceNumber).toBe(1)
    expect(document.engine.canUndo).toBe(true)
    expect(document.engine.canRedo).toBe(false)
    expect(syncStateFromDocument).not.toHaveBeenCalled()
    expect(textState.textContent).toBe('[{"duration":100}]')
    expect(loggerWarnMock).not.toHaveBeenCalled()
  })

  it('在更新事务中接受响应式动画帧补丁', () => {
    const { animationPath, context, document, syncStateFromDocument } = createAnimationActionHarness()
    const reactivePatch = reactive({ ease: 'linear' } satisfies Partial<AnimationFrame>)

    expect(() => applyAnimationFrameUpdate(context, animationPath, 0, reactivePatch)).not.toThrow()

    expect(syncStateFromDocument).toHaveBeenCalledTimes(1)
    expect(document.model.kind).toBe('animation')
    if (document.model.kind !== 'animation') {
      throw new TypeError('expected animation document model')
    }
    expect(document.model.frames[0]).toMatchObject({ duration: 100, ease: 'linear' })
  })

  it('在插入事务中接受响应式动画帧', () => {
    const { animationPath, context, document, syncStateFromDocument } = createAnimationActionHarness()
    const reactiveFrame = reactive({
      duration: 200,
      ease: 'easeInOut',
      position: { x: 16 },
    } satisfies AnimationFrame)

    expect(() => applyAnimationFrameInsert(context, animationPath, 0, reactiveFrame)).not.toThrow()

    expect(syncStateFromDocument).toHaveBeenCalledTimes(1)
    expect(document.model.kind).toBe('animation')
    if (document.model.kind !== 'animation') {
      throw new TypeError('expected animation document model')
    }
    expect(document.model.frames[1]).toMatchObject({
      duration: 200,
      ease: 'easeInOut',
      position: { x: 16 },
    })
  })

  it('场景语句重排后保持选中语句并刷新行号', () => {
    const { context, document, readSceneSelection, scenePath, syncStateFromDocument } = createSceneActionHarness()
    if (document.model.kind !== 'scene') {
      throw new TypeError('expected scene document model')
    }

    const movedStatementId = document.model.statements[1]?.id

    applySceneStatementReorder(context, scenePath, 1, 0)

    expect(syncStateFromDocument).toHaveBeenCalledTimes(1)
    expect(document.model.kind).toBe('scene')
    if (document.model.kind !== 'scene') {
      throw new TypeError('expected scene document model after reorder')
    }

    expect(document.model.statements.map(statement => statement.rawText)).toEqual([
      'beta',
      'alpha',
      'gamma',
    ])
    expect(readSceneSelection()).toMatchObject({
      lastEditedStatementId: movedStatementId,
      lastLineNumber: 1,
      selectedStatementId: movedStatementId,
    })
  })
})
