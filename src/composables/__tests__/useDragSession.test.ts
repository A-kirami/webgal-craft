/* eslint-disable unicorn/no-null -- 测试需要断言拖拽会话契约中的空状态 */
import { afterEach, describe, expect, it } from 'vitest'

import { useDragSession } from '../useDragSession'

import type { EditorTabDragPayload } from '~/types/drag-drop'

const tabPayload: EditorTabDragPayload = {
  path: 'scene/start.txt',
  source: 'editor-tabs',
  type: 'editor-tab',
}

afterEach(() => {
  useDragSession().cancel()
})

describe('useDragSession', () => {
  it('会在同一个会话状态中记录开始位置、当前位置和命中目标', () => {
    const session = useDragSession()
    const target = {} as HTMLElement

    session.start('sort', tabPayload, { x: 12, y: 24 })
    session.updatePosition({ x: 18, y: 30 })
    session.updateDropTarget(target)

    expect(session.state.value).toMatchObject({
      currentDropTarget: target,
      currentPosition: { x: 18, y: 30 },
      isActive: true,
      mode: 'sort',
      payload: tabPayload,
      startPosition: { x: 12, y: 24 },
    })
  })

  it('结束后会清空会话状态', () => {
    const session = useDragSession()

    session.start('sort', tabPayload, { x: 1, y: 2 })
    session.end()

    expect(session.state.value).toMatchObject({
      currentDropTarget: null,
      currentPosition: null,
      isActive: false,
      mode: null,
      payload: null,
      startPosition: null,
    })
  })
})
