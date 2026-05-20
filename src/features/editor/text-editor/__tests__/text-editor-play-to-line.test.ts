import { describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'
import {
  createTextEditorPlayToLineController,
  PLAY_TO_LINE_DISABLED_GLYPH_CLASS_NAME,
  PLAY_TO_LINE_GLYPH_CLASS_NAME,
} from '~/features/editor/text-editor/text-editor-play-to-line'

interface EditorModelMock {
  getLineContent: (lineNumber: number) => string
  getLineCount: () => number
}

function createModel(lines: string[]): EditorModelMock {
  return {
    getLineContent(lineNumber: number) {
      return lines[lineNumber - 1] ?? ''
    },
    getLineCount() {
      return lines.length
    },
  }
}

function createDecorationsCollectionMock() {
  return {
    clear: vi.fn(),
    set: vi.fn((decorations: readonly unknown[]) =>
      decorations.map((_, index) => `glyph-${index + 1}`),
    ),
  }
}

describe('createTextEditorPlayToLineController', () => {
  it('光标进入可播放行时会创建 glyph margin 装饰，并在无效行时清除', () => {
    const decorations = createDecorationsCollectionMock()
    const controller = createTextEditorPlayToLineController({
      editor: {
        createDecorationsCollection: () => decorations,
        getModel: () => createModel(['say:hello', '; comment']),
        getPosition: () => ({ lineNumber: 1 }),
      },
      getHoverMessage: () => '执行到此句',
      getPath: () => AbsPath.from('/project/scene.txt'),
      glyphMarginTargetType: 2,
      isEnabled: () => true,
      isDisabled: () => false,
      syncScenePreview: vi.fn(),
    })

    controller.syncFromEditorPosition()
    controller.syncDecorationsForLine(2)

    expect(decorations.set).toHaveBeenCalledWith([
      {
        range: {
          endColumn: 1,
          endLineNumber: 1,
          startColumn: 1,
          startLineNumber: 1,
        },
        options: {
          glyphMarginClassName: PLAY_TO_LINE_GLYPH_CLASS_NAME,
          glyphMarginHoverMessage: {
            value: '执行到此句',
          },
        },
      },
    ])
    expect(decorations.clear).toHaveBeenCalledTimes(1)
  })

  it('点击 glyph margin 的可播放行时会强制同步场景预览', () => {
    const syncScenePreview = vi.fn()
    const controller = createTextEditorPlayToLineController({
      editor: {
        createDecorationsCollection: () => createDecorationsCollectionMock(),
        getModel: () => createModel(['say:hello', '  ']),
        getPosition: () => ({ lineNumber: 1 }),
      },
      getHoverMessage: () => '执行到此句',
      getPath: () => AbsPath.from('/project/scene.txt'),
      glyphMarginTargetType: 2,
      isEnabled: () => true,
      isDisabled: () => false,
      syncScenePreview,
    })

    controller.syncFromEditorPosition()
    controller.handleMouseDown({
      event: {
        leftButton: true,
      },
      target: {
        position: {
          lineNumber: 1,
        },
        type: 2,
      },
    })
    controller.handleMouseDown({
      event: {
        leftButton: true,
      },
      target: {
        position: {
          lineNumber: 2,
        },
        type: 2,
      },
    })

    expect(syncScenePreview).toHaveBeenCalledTimes(1)
    expect(syncScenePreview).toHaveBeenCalledWith('/project/scene.txt', 1, 'say:hello', true)
  })

  it('只允许点击当前显示播放按钮 glyph 的行', () => {
    const syncScenePreview = vi.fn()
    const controller = createTextEditorPlayToLineController({
      editor: {
        createDecorationsCollection: () => createDecorationsCollectionMock(),
        getModel: () => createModel(['say:hello', 'say:world']),
        getPosition: () => ({ lineNumber: 1 }),
      },
      getHoverMessage: () => '执行到此句',
      getPath: () => AbsPath.from('/project/scene.txt'),
      glyphMarginTargetType: 2,
      isEnabled: () => true,
      isDisabled: () => false,
      syncScenePreview,
    })

    controller.syncFromEditorPosition()
    controller.handleMouseDown({
      event: {
        leftButton: true,
      },
      target: {
        position: {
          lineNumber: 2,
        },
        type: 2,
      },
    })

    expect(syncScenePreview).not.toHaveBeenCalled()
  })

  it('右键点击 glyph margin 的可播放行时不会触发场景预览同步', () => {
    const syncScenePreview = vi.fn()
    const controller = createTextEditorPlayToLineController({
      editor: {
        createDecorationsCollection: () => createDecorationsCollectionMock(),
        getModel: () => createModel(['say:hello']),
        getPosition: () => ({ lineNumber: 1 }),
      },
      getHoverMessage: () => '执行到此句',
      getPath: () => AbsPath.from('/project/scene.txt'),
      glyphMarginTargetType: 2,
      isEnabled: () => true,
      isDisabled: () => false,
      syncScenePreview,
    })

    const mouseEvent: Parameters<typeof controller.handleMouseDown>[0] = {
      event: {
        leftButton: false,
      },
      target: {
        position: {
          lineNumber: 1,
        },
        type: 2,
      },
    }

    controller.handleMouseDown(mouseEvent)

    expect(syncScenePreview).not.toHaveBeenCalled()
  })

  it('禁用时会清空装饰且忽略点击', () => {
    const decorations = createDecorationsCollectionMock()
    const syncScenePreview = vi.fn()
    let enabled = true
    const controller = createTextEditorPlayToLineController({
      editor: {
        createDecorationsCollection: () => decorations,
        getModel: () => createModel(['say:hello']),
        getPosition: () => ({ lineNumber: 1 }),
      },
      getHoverMessage: () => '执行到此句',
      getPath: () => AbsPath.from('/project/scene.txt'),
      glyphMarginTargetType: 2,
      isEnabled: () => enabled,
      isDisabled: () => false,
      syncScenePreview,
    })

    controller.syncFromEditorPosition()
    enabled = false
    controller.syncFromEditorPosition()
    controller.handleMouseDown({
      event: {
        leftButton: true,
      },
      target: {
        position: {
          lineNumber: 1,
        },
        type: 2,
      },
    })

    expect(decorations.clear).toHaveBeenCalledTimes(1)
    expect(syncScenePreview).not.toHaveBeenCalled()
  })

  it('dirty 状态会使用禁用样式并忽略点击', () => {
    const decorations = createDecorationsCollectionMock()
    const syncScenePreview = vi.fn()
    const controller = createTextEditorPlayToLineController({
      editor: {
        createDecorationsCollection: () => decorations,
        getModel: () => createModel(['say:hello']),
        getPosition: () => ({ lineNumber: 1 }),
      },
      getHoverMessage: () => '执行到此句',
      getPath: () => AbsPath.from('/project/scene.txt'),
      glyphMarginTargetType: 2,
      isEnabled: () => true,
      isDisabled: () => true,
      syncScenePreview,
    })

    controller.syncFromEditorPosition()
    controller.handleMouseDown({
      event: {
        leftButton: true,
      },
      target: {
        position: {
          lineNumber: 1,
        },
        type: 2,
      },
    })

    expect(decorations.set).toHaveBeenCalledWith([
      expect.objectContaining({
        options: expect.objectContaining({
          glyphMarginClassName: `${PLAY_TO_LINE_GLYPH_CLASS_NAME} ${PLAY_TO_LINE_DISABLED_GLYPH_CLASS_NAME}`,
        }),
      }),
    ])
    expect(syncScenePreview).not.toHaveBeenCalled()
  })
})
