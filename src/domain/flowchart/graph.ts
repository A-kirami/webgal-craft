import type { FlowchartEdge } from './model'

/**
 * 判断新增一条 `source -> target` 的连线是否会让图出现环。
 *
 * 从 target 出发沿出边搜索，能回到 source 即成环；source 与 target 相同也是环。
 * 纯函数，供命令边界与画布交互共用，避免两处各写一套判定。
 */
export function wouldCreateCycle(
  edges: readonly FlowchartEdge[],
  source: string,
  target: string,
): boolean {
  if (source === target) {
    return true
  }

  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    const targets = outgoing.get(edge.source)
    if (targets) {
      targets.push(edge.target)
    } else {
      outgoing.set(edge.source, [edge.target])
    }
  }

  const visited = new Set<string>()
  const stack = [target]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === source) {
      return true
    }
    if (visited.has(current)) {
      continue
    }
    visited.add(current)
    for (const next of outgoing.get(current) ?? []) {
      stack.push(next)
    }
  }

  return false
}
