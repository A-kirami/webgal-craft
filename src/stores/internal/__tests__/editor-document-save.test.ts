import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'
import { saveEditorDocument } from '~/stores/internal/editor-document-save'
import { createDocumentState, createLoadedDocumentState } from '~/stores/internal/editor-document-state'
import { AppError } from '~/types/errors'

import type { EditorDocumentSaveContext } from '~/stores/internal/editor-document-save'
import type { DocumentState } from '~/stores/internal/editor-document-state'
import type { EditableEditorState, TextProjectionState } from '~/stores/internal/editor-session'

const {
  touchCurrentGameLastModifiedMock,
  refreshCurrentGamePreviewAssetsMock,
  writeDocumentFileMock,
} = vi.hoisted(() => ({
  touchCurrentGameLastModifiedMock: vi.fn(),
  refreshCurrentGamePreviewAssetsMock: vi.fn(),
  writeDocumentFileMock: vi.fn(),
}))

vi.mock('~/services/game-fs', () => ({
  gameFs: {
    writeDocumentFile: writeDocumentFileMock,
  },
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    touchCurrentGameLastModified: touchCurrentGameLastModifiedMock,
    refreshCurrentGamePreviewAssets: refreshCurrentGamePreviewAssetsMock,
  },
}))

function createSaveContext(document: DocumentState): EditorDocumentSaveContext {
  const state = {
    isDirty: true,
    kind: document.model.kind,
    lastSavedTime: undefined,
    projection: 'text',
  } as EditableEditorState
  const textState = {
    isDirty: true,
    lastSavedTime: undefined,
    projection: 'text',
    syncError: undefined,
    textContent: document.savedTextContent,
    textSource: 'draft',
  } as TextProjectionState

  return {
    createEditorError: message => new AppError('EDITOR_ERROR', message),
    getDocumentState: () => document,
    getEditableState: () => state,
    getSceneSelection: vi.fn(),
    getTextProjectionState: () => textState,
    getVisualProjectionState: () => undefined,
    patchSceneSelection: vi.fn(),
    syncStateFromDocument: vi.fn(),
  }
}

describe('saveEditorDocument', () => {
  beforeEach(() => {
    touchCurrentGameLastModifiedMock.mockReset()
    refreshCurrentGamePreviewAssetsMock.mockReset()
    writeDocumentFileMock.mockReset()
    writeDocumentFileMock.mockResolvedValue(undefined)
  })

  it('保存场景文档后只更新游戏修改时间，不刷新预览资源快照', async () => {
    const loadedState = createLoadedDocumentState('scene', 'say:hello;')
    const document = createDocumentState(loadedState.model, loadedState.savedTextContent)
    const context = createSaveContext(document)

    await saveEditorDocument(context, AbsPath.from('/project/game/scene/start.txt'))

    expect(writeDocumentFileMock).toHaveBeenCalledOnce()
    expect(touchCurrentGameLastModifiedMock).toHaveBeenCalledOnce()
    expect(refreshCurrentGamePreviewAssetsMock).not.toHaveBeenCalled()
  })
})
