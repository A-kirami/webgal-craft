import { describe, expect, it } from 'vitest'

import {
  didResumeSingleEditTarget,
  hasMultipleEditTargets,
  readEditorHasMultipleEditTargets,
} from '~/features/editor/text-editor/text-editor-selection'

function createNullValue(): null {
  // eslint-disable-next-line unicorn/no-null -- 测试需要显式传入 null
  return null
}

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

  it('空输入不会被识别为多个编辑目标', () => {
    expect(hasMultipleEditTargets(undefined)).toBe(false)
    expect(hasMultipleEditTargets(createNullValue())).toBe(false)
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

  it('缺少编辑器实例时不会暂停单语句编辑', () => {
    expect(readEditorHasMultipleEditTargets(undefined)).toBe(false)
  })

  it('从多目标选区恢复为单光标时会被识别为恢复单语句编辑', () => {
    expect(didResumeSingleEditTarget({
      oldSelections: [{
        startLineNumber: 2,
        endLineNumber: 3,
      }],
      selection: {
        startLineNumber: 3,
        endLineNumber: 3,
      },
      secondarySelections: [],
    })).toBe(true)
  })

  it('从单光标到单光标的选区变化不会被误判为恢复单语句编辑', () => {
    expect(didResumeSingleEditTarget({
      oldSelections: [{
        startLineNumber: 2,
        endLineNumber: 2,
      }],
      selection: {
        startLineNumber: 3,
        endLineNumber: 3,
      },
      secondarySelections: [],
    })).toBe(false)
  })
})
