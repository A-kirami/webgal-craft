import { describe, expect, it } from 'vitest'

import {
  createScenePresentationState,
  isSceneStatementCollapsed,
  reconcileScenePresentationState,
  setSceneStatementCollapsed,
} from '../scene-presentation'

describe('场景展示状态', () => {
  it('按语句 ID 跟踪折叠状态', () => {
    const presentation = createScenePresentationState()

    expect(isSceneStatementCollapsed(presentation, 1)).toBe(false)
    expect(setSceneStatementCollapsed(presentation, 1, true)).toBe(true)
    expect(isSceneStatementCollapsed(presentation, 1)).toBe(true)
    expect(setSceneStatementCollapsed(presentation, 1, true)).toBe(false)
    expect(setSceneStatementCollapsed(presentation, 1, false)).toBe(true)
    expect(isSceneStatementCollapsed(presentation, 1)).toBe(false)
  })

  it('移除已不存在语句的折叠状态', () => {
    const presentation = createScenePresentationState()

    setSceneStatementCollapsed(presentation, 1, true)
    setSceneStatementCollapsed(presentation, 2, true)

    expect(reconcileScenePresentationState([{ id: 2 }], presentation)).toBe(true)
    expect(isSceneStatementCollapsed(presentation, 1)).toBe(false)
    expect(isSceneStatementCollapsed(presentation, 2)).toBe(true)
    expect(reconcileScenePresentationState([{ id: 2 }], presentation)).toBe(false)
  })
})
