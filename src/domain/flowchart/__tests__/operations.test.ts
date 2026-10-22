import { describe, expect, it } from 'vitest'

import { RelPath } from '~/domain/path'

import { createDefaultFlowchartDocument } from '../codec'
import { FlowchartRuleError, MAIN_FLOWCHART_ID } from '../model'
import {
  addEdge,
  addNode,
  bindNodeScene,
  createFlowchart,
  deleteEdges,
  deleteFlowchart,
  deleteNodes,
  moveNode,
  renameFlowchart,
  renameNode,
} from '../operations'

import type { FlowchartDocument } from '../model'

const defaults = {
  mainFlowchartName: '主线剧情',
  nodeTitle: '节点',
  rootNodeTitle: '起点',
}

function createDocument(): FlowchartDocument {
  return createDefaultFlowchartDocument(defaults)
}

function scene(name: string) {
  return RelPath.from(name)
}

describe('flowchart operations', () => {
  it('默认文档包含不可删除的主线与居中空根节点', () => {
    const document = createDocument()
    const main = document.flowcharts[0]!

    expect(main.id).toBe(MAIN_FLOWCHART_ID)
    expect(main.kind).toBe('main')
    expect(main.nodes).toHaveLength(1)
    expect(main.nodes[0]).toMatchObject({ isRoot: true, position: { x: 0, y: 0 }, title: '起点', scene: undefined })
    expect(() => deleteNodes(document, main.id, [main.nodes[0]!.id])).toThrow(FlowchartRuleError)
    expect(() => deleteFlowchart(document, main.id)).toThrow(FlowchartRuleError)
  })

  it('新增节点派生唯一 id 且不影响已有节点', () => {
    const document = createDocument()
    const main = document.flowcharts[0]!

    const first = addNode(document, main.id, { title: '第一章', position: { x: 120, y: 80 } })
    const second = addNode(first.document, main.id, { title: '第二章', position: { x: 120, y: 200 } })

    expect(first.id).toBe('node-1')
    expect(second.id).toBe('node-2')
    expect(second.document.flowcharts[0]!.nodes).toHaveLength(3)
    expect(document.flowcharts[0]!.nodes).toHaveLength(1)
  })

  it('删除节点时同时删除相关连线，但拒绝删除根节点', () => {
    const document = createDocument()
    const main = document.flowcharts[0]!
    const rootId = main.nodes[0]!.id
    const { document: withNode, id: nodeId } = addNode(document, main.id, { title: '第一章', position: { x: 0, y: 120 } })
    const { document: connected } = addEdge(withNode, main.id, rootId, nodeId)

    const removed = deleteNodes(connected, main.id, [nodeId])
    expect(removed.flowcharts[0]!.nodes.map(node => node.id)).toEqual([rootId])
    expect(removed.flowcharts[0]!.edges).toEqual([])

    expect(() => deleteNodes(connected, main.id, [rootId])).toThrow(/根节点不可删除/)
  })

  it('移动与重命名节点只修改目标节点', () => {
    const document = createDocument()
    const main = document.flowcharts[0]!
    const rootId = main.nodes[0]!.id

    const moved = moveNode(document, main.id, rootId, { x: 40, y: 60 })
    const renamed = renameNode(moved, main.id, rootId, '  序章  ')

    expect(renamed.flowcharts[0]!.nodes[0]).toMatchObject({ position: { x: 40, y: 60 }, title: '序章' })
    expect(() => renameNode(renamed, main.id, rootId, ' '.repeat(3))).toThrow(FlowchartRuleError)
  })

  it('绑定场景时同步更新自动派生的标题，保留用户自定义标题', () => {
    const document = createDocument()
    const main = document.flowcharts[0]!
    const rootId = main.nodes[0]!.id
    const { document: withNode, id: nodeId } = addNode(document, main.id, {
      title: '开始',
      position: { x: 0, y: 120 },
      scene: scene('chapter/开始.txt'),
    })

    // 标题由场景派生，替换场景时同步更新
    const rebound = bindNodeScene(withNode, main.id, nodeId, scene('chapter/终章.txt'))
    expect(rebound.flowcharts[0]!.nodes.find(node => node.id === nodeId)).toMatchObject({
      title: '终章',
      scene: 'chapter/终章.txt',
    })

    // 用户改过标题后不再跟随场景
    const renamed = renameNode(rebound, main.id, nodeId, '自定义标题')
    const replaced = bindNodeScene(renamed, main.id, nodeId, scene('epilogue.txt'))
    expect(replaced.flowcharts[0]!.nodes.find(node => node.id === nodeId)!.title).toBe('自定义标题')

    // 从未绑定过场景的节点（含默认根节点）保留自身标题
    const boundRoot = bindNodeScene(document, main.id, rootId, scene('start.txt'))
    expect(boundRoot.flowcharts[0]!.nodes[0]).toMatchObject({ title: '起点', scene: 'start.txt' })
  })

  it('拒绝自环、重复连线与成环连线', () => {
    const document = createDocument()
    const main = document.flowcharts[0]!
    const rootId = main.nodes[0]!.id
    const { document: withA, id: nodeA } = addNode(document, main.id, { title: 'A', position: { x: 0, y: 120 } })
    const { document: withB, id: nodeB } = addNode(withA, main.id, { title: 'B', position: { x: 0, y: 240 } })

    expect(() => addEdge(withB, main.id, nodeA, nodeA)).toThrow(/节点不能连接自身/)

    const { document: rootToA } = addEdge(withB, main.id, rootId, nodeA)
    const { document: aToB } = addEdge(rootToA, main.id, nodeA, nodeB)

    expect(() => addEdge(aToB, main.id, rootId, nodeA)).toThrow(/已经存在/)
    expect(() => addEdge(aToB, main.id, nodeB, rootId)).toThrow(/循环依赖/)
    expect(aToB.flowcharts[0]!.edges.map(edge => edge.id)).toEqual(['edge-1', 'edge-2'])
  })

  it('删除连线只移除目标连线', () => {
    const document = createDocument()
    const main = document.flowcharts[0]!
    const rootId = main.nodes[0]!.id
    const { document: withNode, id: nodeId } = addNode(document, main.id, { title: 'A', position: { x: 0, y: 120 } })
    const { document: connected, id: edgeId } = addEdge(withNode, main.id, rootId, nodeId)

    expect(deleteEdges(connected, main.id, [edgeId]).flowcharts[0]!.edges).toEqual([])
    expect(deleteEdges(connected, main.id, []).flowcharts[0]!.edges).toHaveLength(1)
  })

  it('新建支线自带居中根节点，并支持重命名与删除', () => {
    const document = createDocument()
    const created = createFlowchart(document, {
      name: '支线剧情1',
      rootTitle: '起点',
      position: { x: 0, y: 0 },
    })
    const branch = created.document.flowcharts.find(flowchart => flowchart.id === created.id)!

    expect(branch).toMatchObject({ id: 'branch-1', kind: 'character', name: '支线剧情1' })
    expect(branch.nodes).toHaveLength(1)
    expect(branch.nodes[0]).toMatchObject({ isRoot: true, position: { x: 0, y: 0 } })

    const renamed = renameFlowchart(created.document, branch.id, '支线剧情二')
    expect(renamed.flowcharts.find(flowchart => flowchart.id === branch.id)!.name).toBe('支线剧情二')
    expect(renameFlowchart(renamed, branch.id, '  支线剧情二  ')).toBe(renamed)

    const deleted = deleteFlowchart(renamed, branch.id)
    expect(deleted.flowcharts.map(flowchart => flowchart.id)).toEqual([MAIN_FLOWCHART_ID])
  })

  it('拒绝空名称的流程与节点', () => {
    const document = createDocument()

    expect(() => createFlowchart(document, { name: '  ', rootTitle: '起点', position: { x: 0, y: 0 } }))
      .toThrow(/名称不能为空/)
    expect(() => renameFlowchart(document, MAIN_FLOWCHART_ID, '')).toThrow(/名称不能为空/)
  })
})
