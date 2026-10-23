import * as z from 'zod'

import { RelPath } from '~/domain/path'

import { MAIN_FLOWCHART_ID } from './model'

import type {
  Flowchart,
  FlowchartDocument,
  FlowchartEdge,
  FlowchartKind,
  FlowchartNode,
  FlowchartSceneRef,
} from './model'

/** 流程图持久化文件在工程内的逻辑路径 */
export const FLOWCHART_FILE_REL_PATH = RelPath.from('game/flowchart.json')

export class FlowchartParseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'FlowchartParseError'
  }
}

/** 新建默认结构时使用的名称；由调用方按当前界面语言提供，不进入领域层 */
export interface FlowchartDocumentDefaults {
  mainFlowchartName: string
  nodeTitle: string
  rootNodeTitle: string
}

export interface FlowchartParseResult {
  document: FlowchartDocument
  /** 解析过程中被修复的数据；调用方负责提示，解析本身不静默吞掉异常 */
  warnings: string[]
}

const rawNodeSchema = z.looseObject({
  id: z.string().min(1),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.looseObject({
    label: z.string().optional(),
    sceneName: z.string().optional(),
    isRoot: z.boolean().optional(),
  }).optional(),
})

const rawEdgeSchema = z.looseObject({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
})

const rawFlowchartSchema = z.looseObject({
  id: z.string().min(1),
  name: z.string().optional(),
  nodes: z.array(rawNodeSchema).optional(),
  edges: z.array(rawEdgeSchema).optional(),
})

const rawDocumentSchema = z.looseObject({
  flowcharts: z.array(rawFlowchartSchema),
})

type RawEdge = z.infer<typeof rawEdgeSchema>
type RawFlowchart = z.infer<typeof rawFlowchartSchema>
type RawNode = z.infer<typeof rawNodeSchema>

function parseSceneRef(raw: string | undefined): FlowchartSceneRef | undefined {
  if (raw === undefined || raw === '') {
    return undefined
  }

  try {
    return RelPath.from(raw)
  } catch (error) {
    throw new FlowchartParseError(`场景引用不是工程相对路径: ${raw}`, { cause: error })
  }
}

/**
 * 解析 `flowchart.json`。
 *
 * 只做结构校验与必要的修复（剔除重复 id、悬空连线），缺失文件由调用方处理；
 * JSON 或结构损坏时抛出 `FlowchartParseError`，由编辑入口给出可恢复错误，不覆盖用户文件。
 */
export function parseFlowchartDocument(raw: string): FlowchartParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new FlowchartParseError('流程图文件不是合法的 JSON', { cause: error })
  }

  const result = rawDocumentSchema.safeParse(parsed)
  if (!result.success) {
    throw new FlowchartParseError(`流程图文件结构不合法: ${result.error.message}`)
  }

  const flowchartIds = result.data.flowcharts.map(flowchart => flowchart.id)
  if (new Set(flowchartIds).size !== flowchartIds.length) {
    throw new FlowchartParseError('流程图 id 不能重复')
  }

  const warnings: string[] = []
  const document: FlowchartDocument = {
    flowcharts: result.data.flowcharts.map(flowchart => parseFlowchart(flowchart, warnings)),
  }

  return { document, warnings }
}

function parseFlowchart(raw: RawFlowchart, warnings: string[]): Flowchart {
  const nodes = parseNodes(raw.nodes ?? [], warnings)
  const nodeIds = new Set(nodes.map(node => node.id))

  return {
    id: raw.id,
    kind: resolveKind(raw.id),
    name: raw.name ?? '',
    nodes,
    edges: parseEdges(raw.edges ?? [], nodeIds, warnings),
  }
}

/** 主线身份由 id 决定；其余一律视为支线，避免出现第二个不可删除的流程图 */
function resolveKind(flowchartId: string): FlowchartKind {
  return flowchartId === MAIN_FLOWCHART_ID ? 'main' : 'character'
}

function parseNodes(rawNodes: readonly RawNode[], warnings: string[]): FlowchartNode[] {
  const nodes: FlowchartNode[] = []
  const usedIds = new Set<string>()

  for (const rawNode of rawNodes) {
    if (usedIds.has(rawNode.id)) {
      warnings.push(`重复节点 id 已忽略: ${rawNode.id}`)
      continue
    }
    usedIds.add(rawNode.id)

    nodes.push({
      id: rawNode.id,
      title: rawNode.data?.label ?? '',
      scene: parseSceneRef(rawNode.data?.sceneName),
      position: { x: rawNode.position.x, y: rawNode.position.y },
      isRoot: rawNode.data?.isRoot === true,
    })
  }

  return keepSingleRoot(nodes, warnings)
}

/** 每个流程图只能有一个根节点；重复标记时保留第一个 */
function keepSingleRoot(nodes: readonly FlowchartNode[], warnings: string[]): FlowchartNode[] {
  let rootSeen = false
  return nodes.map((node) => {
    if (!node.isRoot) {
      return node
    }
    if (rootSeen) {
      warnings.push(`重复根节点标记已清除: ${node.id}`)
      return { ...node, isRoot: false }
    }
    rootSeen = true
    return node
  })
}

function parseEdges(rawEdges: readonly RawEdge[], nodeIds: ReadonlySet<string>, warnings: string[]): FlowchartEdge[] {
  const edges: FlowchartEdge[] = []
  const usedIds = new Set<string>()

  for (const rawEdge of rawEdges) {
    if (usedIds.has(rawEdge.id)) {
      warnings.push(`重复连线 id 已忽略: ${rawEdge.id}`)
      continue
    }

    const edge: FlowchartEdge = {
      id: rawEdge.id,
      source: rawEdge.source,
      target: rawEdge.target,
    }
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      warnings.push(`指向缺失节点的连线已忽略: ${edge.id}`)
      continue
    }

    usedIds.add(edge.id)
    edges.push(edge)
  }

  return edges
}

function createRootNode(title: string): FlowchartNode {
  return {
    id: 'root',
    title,
    scene: undefined,
    position: { x: 0, y: 0 },
    isRoot: true,
  }
}

/**
 * 补齐编辑所需的不变量：主线存在、每个流程图恰有一个根节点、名称和节点标题非空。
 *
 * 文件可能包含空流程图，或缺少根节点标记；
 * 编辑器只处理补全后的状态，避免空状态成为正常的可编辑状态。
 */
export function normalizeFlowchartDocument(
  document: FlowchartDocument,
  defaults: FlowchartDocumentDefaults,
): FlowchartDocument {
  const flowcharts = document.flowcharts.map(flowchart => normalizeFlowchart(flowchart, defaults))
  const hasMain = flowcharts.some(flowchart => flowchart.id === MAIN_FLOWCHART_ID)

  return {
    flowcharts: hasMain ? flowcharts : [createDefaultMainFlowchart(defaults), ...flowcharts],
  }
}

function normalizeFlowchart(flowchart: Flowchart, defaults: FlowchartDocumentDefaults): Flowchart {
  const defaultName = flowchart.kind === 'main' ? defaults.mainFlowchartName : flowchart.id
  const name = flowchart.name.trim() ? flowchart.name : defaultName
  const nodes = flowchart.nodes.map(node => ({
    ...node,
    title: node.title.trim() || (node.isRoot ? defaults.rootNodeTitle : defaults.nodeTitle),
  }))

  if (nodes.some(node => node.isRoot)) {
    return { ...flowchart, name, nodes }
  }

  if (nodes.length === 0) {
    return { ...flowchart, name, nodes: [createRootNode(defaults.rootNodeTitle)] }
  }

  return {
    ...flowchart,
    name,
    nodes: nodes.map((node, index) => (index === 0 ? { ...node, isRoot: true } : node)),
  }
}

function createDefaultMainFlowchart(defaults: FlowchartDocumentDefaults): Flowchart {
  return {
    id: MAIN_FLOWCHART_ID,
    kind: 'main',
    name: defaults.mainFlowchartName,
    nodes: [createRootNode(defaults.rootNodeTitle)],
    edges: [],
  }
}

export function createDefaultFlowchartDocument(defaults: FlowchartDocumentDefaults): FlowchartDocument {
  return { flowcharts: [createDefaultMainFlowchart(defaults)] }
}

/**
 * 序列化为 `flowchart.json` 内容。
 *
 * 只写稳定业务字段：Vue Flow 的选中态、尺寸、视口和历史记录都不落盘。
 */
export function serializeFlowchartDocument(document: FlowchartDocument): string {
  const raw = {
    flowcharts: document.flowcharts.map(flowchart => ({
      id: flowchart.id,
      name: flowchart.name,
      type: flowchart.kind,
      nodes: flowchart.nodes.map(node => ({
        id: node.id,
        type: 'custom',
        position: { x: node.position.x, y: node.position.y },
        data: {
          label: node.title,
          sceneName: node.scene ?? '',
          ...(node.isRoot ? { isRoot: true } : {}),
        },
      })),
      edges: flowchart.edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      })),
    })),
  }

  return `${JSON.stringify(raw, undefined, 2)}\n`
}
