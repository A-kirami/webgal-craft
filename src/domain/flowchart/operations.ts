import { wouldCreateCycle } from './graph'
import {
  deriveSceneNodeTitle,
  FlowchartRuleError,
  MAIN_FLOWCHART_ID,
  requireFlowchart,
  requireNode,
} from './model'

import type {
  Flowchart,
  FlowchartDocument,
  FlowchartNode,
  FlowchartNodePosition,
  FlowchartSceneRef,
} from './model'

export interface FlowchartNodeDraft {
  title: string
  position: FlowchartNodePosition
  scene?: FlowchartSceneRef
}

export interface FlowchartMutationResult {
  document: FlowchartDocument
  /** 新建元素的稳定身份，供调用方选中或切换 */
  id: string
}

function uniqueId(used: ReadonlySet<string>, make: (index: number) => string): string {
  let index = 1
  let candidate = make(index)
  while (used.has(candidate)) {
    index += 1
    candidate = make(index)
  }
  return candidate
}

function requireName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) {
    throw new FlowchartRuleError('invalid-name', '名称不能为空')
  }
  return trimmed
}

function updateFlowchart(
  document: FlowchartDocument,
  flowchartId: string,
  update: (flowchart: Flowchart) => Flowchart,
): FlowchartDocument {
  const flowchart = requireFlowchart(document, flowchartId)
  const next = update(flowchart)
  if (next === flowchart) {
    return document
  }

  return {
    flowcharts: document.flowcharts.map(candidate => (candidate.id === next.id ? next : candidate)),
  }
}

/** 无变化的更新保持原引用，避免把"点开又收起"这类操作记进撤销历史 */
function updateNode(
  flowchart: Flowchart,
  nodeId: string,
  update: (node: FlowchartNode) => FlowchartNode,
): Flowchart {
  const node = requireNode(flowchart, nodeId)
  const next = update(node)
  if (next === node) {
    return flowchart
  }

  return {
    ...flowchart,
    nodes: flowchart.nodes.map(candidate => (candidate.id === nodeId ? next : candidate)),
  }
}

export function addNode(
  document: FlowchartDocument,
  flowchartId: string,
  draft: FlowchartNodeDraft,
): FlowchartMutationResult {
  const flowchart = requireFlowchart(document, flowchartId)
  const nodeId = uniqueId(new Set(flowchart.nodes.map(node => node.id)), index => `node-${index}`)
  const node: FlowchartNode = {
    id: nodeId,
    title: draft.title.trim(),
    scene: draft.scene,
    position: draft.position,
    isRoot: false,
  }

  return {
    document: updateFlowchart(document, flowchartId, current => ({
      ...current,
      nodes: [...current.nodes, node],
    })),
    id: nodeId,
  }
}

export function moveNode(
  document: FlowchartDocument,
  flowchartId: string,
  nodeId: string,
  position: FlowchartNodePosition,
): FlowchartDocument {
  return updateFlowchart(document, flowchartId, flowchart => updateNode(flowchart, nodeId, (node) => {
    if (node.position.x === position.x && node.position.y === position.y) {
      return node
    }
    return { ...node, position }
  }))
}

export function renameNode(
  document: FlowchartDocument,
  flowchartId: string,
  nodeId: string,
  title: string,
): FlowchartDocument {
  const nextTitle = requireName(title)
  return updateFlowchart(document, flowchartId, flowchart => updateNode(flowchart, nodeId, node => (
    node.title === nextTitle ? node : { ...node, title: nextTitle }
  )))
}

/**
 * 绑定或替换节点场景。
 *
 * 标题仍等于旧场景的派生标题时视为自动标题，随之更新；用户改过的标题保持不变。
 */
export function bindNodeScene(
  document: FlowchartDocument,
  flowchartId: string,
  nodeId: string,
  scene: FlowchartSceneRef,
): FlowchartDocument {
  return updateFlowchart(document, flowchartId, flowchart => updateNode(flowchart, nodeId, (node) => {
    if (node.scene === scene) {
      return node
    }

    const usesDerivedTitle = node.scene !== undefined && node.title === deriveSceneNodeTitle(node.scene)
    return {
      ...node,
      scene,
      title: usesDerivedTitle ? deriveSceneNodeTitle(scene) : node.title,
    }
  }))
}

export function deleteNodes(
  document: FlowchartDocument,
  flowchartId: string,
  nodeIds: readonly string[],
): FlowchartDocument {
  const removedIds = new Set(nodeIds)
  if (removedIds.size === 0) {
    return document
  }

  return updateFlowchart(document, flowchartId, (flowchart) => {
    for (const nodeId of removedIds) {
      if (requireNode(flowchart, nodeId).isRoot) {
        throw new FlowchartRuleError('root-node-protected', '根节点不可删除')
      }
    }

    return {
      ...flowchart,
      nodes: flowchart.nodes.filter(node => !removedIds.has(node.id)),
      edges: flowchart.edges.filter(edge => !removedIds.has(edge.source) && !removedIds.has(edge.target)),
    }
  })
}

export function addEdge(
  document: FlowchartDocument,
  flowchartId: string,
  source: string,
  target: string,
): FlowchartMutationResult {
  const flowchart = requireFlowchart(document, flowchartId)
  requireNode(flowchart, source)
  requireNode(flowchart, target)

  if (source === target) {
    throw new FlowchartRuleError('self-loop', '节点不能连接自身')
  }

  if (flowchart.edges.some(edge => edge.source === source && edge.target === target)) {
    throw new FlowchartRuleError('duplicate-edge', '这条连线已经存在')
  }

  if (wouldCreateCycle(flowchart.edges, source, target)) {
    throw new FlowchartRuleError('cycle', '这条连线会形成循环依赖')
  }

  const edgeId = uniqueId(new Set(flowchart.edges.map(edge => edge.id)), index => `edge-${index}`)
  return {
    document: updateFlowchart(document, flowchartId, current => ({
      ...current,
      edges: [...current.edges, { id: edgeId, source, target }],
    })),
    id: edgeId,
  }
}

export function deleteEdges(
  document: FlowchartDocument,
  flowchartId: string,
  edgeIds: readonly string[],
): FlowchartDocument {
  const removedIds = new Set(edgeIds)
  if (removedIds.size === 0) {
    return document
  }

  return updateFlowchart(document, flowchartId, flowchart => ({
    ...flowchart,
    edges: flowchart.edges.filter(edge => !removedIds.has(edge.id)),
  }))
}

export interface FlowchartCreationDraft {
  name: string
  rootTitle: string
  position: FlowchartNodePosition
}

/** 新建支线；创建时即带一个位于画布中心的空根节点 */
export function createFlowchart(
  document: FlowchartDocument,
  draft: FlowchartCreationDraft,
): FlowchartMutationResult {
  const name = requireName(draft.name)
  const flowchartId = uniqueId(
    new Set(document.flowcharts.map(flowchart => flowchart.id)),
    index => `branch-${index}`,
  )
  const flowchart: Flowchart = {
    id: flowchartId,
    kind: 'character',
    name,
    nodes: [{
      id: 'root',
      title: draft.rootTitle,
      scene: undefined,
      position: draft.position,
      isRoot: true,
    }],
    edges: [],
  }

  return {
    document: { flowcharts: [...document.flowcharts, flowchart] },
    id: flowchartId,
  }
}

export function renameFlowchart(
  document: FlowchartDocument,
  flowchartId: string,
  name: string,
): FlowchartDocument {
  const nextName = requireName(name)
  return updateFlowchart(document, flowchartId, flowchart => (
    flowchart.name === nextName ? flowchart : { ...flowchart, name: nextName }
  ))
}

export function deleteFlowchart(document: FlowchartDocument, flowchartId: string): FlowchartDocument {
  const flowchart = requireFlowchart(document, flowchartId)
  if (flowchart.id === MAIN_FLOWCHART_ID || flowchart.kind === 'main') {
    throw new FlowchartRuleError('main-flowchart-protected', '主线流程图不可删除')
  }

  return { flowcharts: document.flowcharts.filter(candidate => candidate.id !== flowchartId) }
}
