import { FLOWCHART_NODE_HEIGHT, FLOWCHART_NODE_WIDTH } from './flowchart-node-view'

import type { FlowchartNodePosition } from '~/domain/flowchart/model'

export interface FlowchartNodeBounds extends FlowchartNodePosition {
  width: number
  height: number
}

const NODE_GAP = 24

/** 沿已有节点四侧寻找空位；最外侧候选点保证可用，优先选离预期位置近的点。 */
export function findAvailableNodePosition(
  preferred: FlowchartNodePosition,
  occupied: readonly FlowchartNodeBounds[],
): FlowchartNodePosition {
  const candidates = [preferred, ...occupied.flatMap(node => [
    { x: preferred.x, y: Math.ceil(node.y + node.height + NODE_GAP) },
    { x: Math.ceil(node.x + node.width + NODE_GAP), y: preferred.y },
    { x: preferred.x, y: Math.floor(node.y - FLOWCHART_NODE_HEIGHT - NODE_GAP) },
    { x: Math.floor(node.x - FLOWCHART_NODE_WIDTH - NODE_GAP), y: preferred.y },
  ])]
  candidates.sort((a, b) => Math.hypot(a.x - preferred.x, a.y - preferred.y) - Math.hypot(b.x - preferred.x, b.y - preferred.y))

  return candidates.find(candidate => occupied.every(node => (
    candidate.x + FLOWCHART_NODE_WIDTH + NODE_GAP <= node.x
    || candidate.x >= node.x + node.width + NODE_GAP
    || candidate.y + FLOWCHART_NODE_HEIGHT + NODE_GAP <= node.y
    || candidate.y >= node.y + node.height + NODE_GAP
  )))!
}
