import { describe, expect, it } from 'vitest'

import { findAvailableNodePosition } from '../flowchart-node-placement'
import { FLOWCHART_NODE_HEIGHT, FLOWCHART_NODE_WIDTH } from '../flowchart-node-view'

import type { FlowchartNodeBounds } from '../flowchart-node-placement'

function bounds(x: number, y: number): FlowchartNodeBounds {
  return { x, y, width: FLOWCHART_NODE_WIDTH, height: FLOWCHART_NODE_HEIGHT }
}

function expectSeparated(a: FlowchartNodeBounds, b: FlowchartNodeBounds) {
  expect(a.x + a.width + 24 <= b.x
    || b.x + b.width + 24 <= a.x
    || a.y + a.height + 24 <= b.y
    || b.y + b.height + 24 <= a.y).toBe(true)
}

describe('findAvailableNodePosition', () => {
  it('没有节点或预期位置空闲时保留原位置', () => {
    const preferred = { x: 300, y: -100 }
    expect(findAvailableNodePosition(preferred, [])).toEqual(preferred)
    expect(findAvailableNodePosition(preferred, [bounds(0, 0)])).toEqual(preferred)
  })

  it('预期位置被占用时放在相邻空位，并留出间距', () => {
    expect(findAvailableNodePosition({ x: 0, y: 0 }, [bounds(0, 0)]))
      .toEqual({ x: 0, y: 120 })
  })

  it('只与卡片边缘重叠或间距不足时也会避让', () => {
    const existing = bounds(0, 0)
    for (const preferred of [{ x: 220, y: 90 }, { x: 230, y: 0 }]) {
      const position = findAvailableNodePosition(preferred, [existing])
      expectSeparated(bounds(position.x, position.y), existing)
    }
  })

  it('按实际尺寸避让较大的节点，支持负坐标', () => {
    const existing = { x: -200, y: -300, width: 400, height: 500 }
    const position = findAvailableNodePosition({ x: -100, y: -100 }, [existing])
    expectSeparated(bounds(position.x, position.y), existing)
  })

  it('连续添加多个节点时彼此分离，且不移动已有节点', () => {
    const occupied = [bounds(0, 0)]
    for (let index = 0; index < 40; index += 1) {
      const position = findAvailableNodePosition({ x: 0, y: 0 }, occupied)
      const next = bounds(position.x, position.y)
      for (const existing of occupied) {
        expectSeparated(next, existing)
      }
      occupied.push(next)
    }
    expect(occupied[0]).toEqual(bounds(0, 0))
  })

  it('删除节点腾出的空位可以再次使用', () => {
    const first = bounds(0, 0)
    const second = bounds(0, 120)
    expect(findAvailableNodePosition({ x: 0, y: 0 }, [first, second])).not.toEqual({ x: 0, y: 120 })
    expect(findAvailableNodePosition({ x: 0, y: 0 }, [first])).toEqual({ x: 0, y: 120 })
  })
})
