import { RelPath } from '~/domain/path'

/**
 * 流程图持久化模型。
 *
 * 持久化结构遵循 WebGAL 的 `game/flowchart.json` 格式：
 * 节点数据放在 `data` 下（`label` / `sceneName` / `isRoot`），边只保留 `id` / `source` / `target`。
 * 领域层只承载业务字段，Vue Flow 的运行时状态（选中、尺寸、视口）不进入模型。
 */

/** 主线流程图使用稳定身份，不随用户重命名变化 */
export const MAIN_FLOWCHART_ID = 'main'

/** 场景引用相对于 `game/scene` 目录，对应持久化字段 `data.sceneName` */
export type FlowchartSceneRef = RelPath

export type FlowchartKind = 'main' | 'character'

export interface FlowchartNodePosition {
  x: number
  y: number
}

export interface FlowchartNode {
  id: string
  /** 节点标题，同时也是持久化文件中的 `data.label` */
  title: string
  /** 绑定的场景文件；未绑定时为 undefined */
  scene: FlowchartSceneRef | undefined
  position: FlowchartNodePosition
  /** 每个流程图有且只有一个根节点；根节点不可删除 */
  isRoot: boolean
}

export interface FlowchartEdge {
  id: string
  source: string
  target: string
}

export interface Flowchart {
  id: string
  kind: FlowchartKind
  name: string
  nodes: FlowchartNode[]
  edges: FlowchartEdge[]
}

export interface FlowchartDocument {
  flowcharts: Flowchart[]
}

/** 业务规则冲突；在命令边界抛出，由调用方给出反馈，不静默修正 */
export type FlowchartRuleViolation =
  | 'cycle'
  | 'duplicate-edge'
  | 'flowchart-not-found'
  | 'invalid-name'
  | 'main-flowchart-protected'
  | 'node-not-found'
  | 'root-node-protected'
  | 'self-loop'

export class FlowchartRuleError extends Error {
  readonly violation: FlowchartRuleViolation

  constructor(violation: FlowchartRuleViolation, message: string) {
    super(message)
    this.name = 'FlowchartRuleError'
    this.violation = violation
  }
}

export function findFlowchart(
  document: FlowchartDocument,
  flowchartId: string,
): Flowchart | undefined {
  return document.flowcharts.find(flowchart => flowchart.id === flowchartId)
}

export function requireFlowchart(document: FlowchartDocument, flowchartId: string): Flowchart {
  const flowchart = findFlowchart(document, flowchartId)
  if (!flowchart) {
    throw new FlowchartRuleError('flowchart-not-found', `流程图不存在: ${flowchartId}`)
  }
  return flowchart
}

export function findNode(flowchart: Flowchart, nodeId: string): FlowchartNode | undefined {
  return flowchart.nodes.find(node => node.id === nodeId)
}

export function requireNode(flowchart: Flowchart, nodeId: string): FlowchartNode {
  const node = findNode(flowchart, nodeId)
  if (!node) {
    throw new FlowchartRuleError('node-not-found', `节点不存在: ${nodeId}`)
  }
  return node
}

/** 场景文件名派生出的节点标题：去掉目录与扩展名 */
export function deriveSceneNodeTitle(scene: FlowchartSceneRef): string {
  const name = RelPath.basename(scene)
  const dotIndex = name.lastIndexOf('.')
  return dotIndex > 0 ? name.slice(0, dotIndex) : name
}
