import { describe, expect, it } from 'vitest'

import {
  isPlayableSceneLine,
  resolvePlayableScenePreviewLine,
  resolveSceneCursorTarget,
  resolveScenePreviewLine,
} from '~/features/editor/text-editor/text-editor-scene-sync'

describe('文本编辑器场景同步', () => {
  it('只在行号有效时返回场景预览行内容', () => {
    const reader = {
      getLineContent(lineNumber: number) {
        return ['alpha', 'beta', 'gamma'][lineNumber - 1] ?? ''
      },
      getLineCount() {
        return 3
      },
    }

    expect(resolveScenePreviewLine(2, reader)).toEqual({
      lineNumber: 2,
      lineText: 'beta',
    })
    expect(resolveScenePreviewLine(0, reader)).toBeUndefined()
    expect(resolveScenePreviewLine(4, reader)).toBeUndefined()
  })

  it('仅在非空且非注释行时返回可播放场景预览行', () => {
    const reader = {
      getLineContent(lineNumber: number) {
        return ['say:hello', '   ', '  ; comment'][lineNumber - 1] ?? ''
      },
      getLineCount() {
        return 3
      },
    }

    expect(isPlayableSceneLine('say:hello')).toBe(true)
    expect(isPlayableSceneLine('   ; comment')).toBe(false)
    expect(isPlayableSceneLine('  ')).toBe(false)

    expect(resolvePlayableScenePreviewLine(1, reader)).toEqual({
      lineNumber: 1,
      lineText: 'say:hello',
    })
    expect(resolvePlayableScenePreviewLine(2, reader)).toBeUndefined()
    expect(resolvePlayableScenePreviewLine(3, reader)).toBeUndefined()
  })

  it('会把光标目标行钳制在模型范围内', () => {
    const reader = {
      getLineCount() {
        return 3
      },
      getLineMaxColumn(lineNumber: number) {
        return [5, 8, 3][lineNumber - 1] ?? 1
      },
    }

    expect(resolveSceneCursorTarget(99, reader)).toEqual({
      shouldUpdatePosition: true,
      targetPosition: {
        column: 3,
        lineNumber: 3,
      },
    })
    expect(resolveSceneCursorTarget(-1, reader)).toEqual({
      shouldUpdatePosition: true,
      targetPosition: {
        column: 5,
        lineNumber: 1,
      },
    })
  })

  it('目标位置未变化时不会要求重复设置光标', () => {
    const reader = {
      getLineCount() {
        return 2
      },
      getLineMaxColumn() {
        return 6
      },
    }

    expect(resolveSceneCursorTarget(2, reader, {
      column: 6,
      lineNumber: 2,
    })).toEqual({
      shouldUpdatePosition: false,
      targetPosition: {
        column: 6,
        lineNumber: 2,
      },
    })
  })

  it('缺失目标行号时返回空结果', () => {
    expect(resolveSceneCursorTarget(undefined, {
      getLineCount() {
        return 1
      },
      getLineMaxColumn() {
        return 1
      },
    })).toBeUndefined()
  })
})
