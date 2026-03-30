import { describe, expect, it } from 'vitest'

import { hasMultipleEditTargets, readEditorHasMultipleEditTargets } from '~/features/editor/text-editor/text-editor-selection'

describe('text-editor-selection', () => {
  it('跨行选区会被识别为多个编辑目标', () => {
    expect(hasMultipleEditTargets({
      selection: {
        startLineNumber: 2,
        endLineNumber: 3,
      },
    })).toBe(true)
  })

  it('存在辅助光标时会被识别为多个编辑目标', () => {
    expect(hasMultipleEditTargets({
      selection: {
        startLineNumber: 2,
        endLineNumber: 2,
      },
      secondarySelections: [{
        startLineNumber: 3,
        endLineNumber: 3,
      }],
    })).toBe(true)
  })

  it('单行单光标选区不会被识别为多个编辑目标', () => {
    expect(hasMultipleEditTargets({
      selection: {
        startLineNumber: 2,
        endLineNumber: 2,
      },
    })).toBe(false)
  })

  it('编辑器存在多个 selections 时会暂停单语句编辑', () => {
    expect(readEditorHasMultipleEditTargets({
      getSelections: () => [
        {
          startLineNumber: 2,
          endLineNumber: 2,
        },
        {
          startLineNumber: 3,
          endLineNumber: 3,
        },
      ] as never,
    })).toBe(true)
  })

  it('编辑器主选区跨行时会暂停单语句编辑', () => {
    expect(readEditorHasMultipleEditTargets({
      getSelections: () => [{
        startLineNumber: 2,
        endLineNumber: 3,
      }] as never,
    })).toBe(true)
  })
})
