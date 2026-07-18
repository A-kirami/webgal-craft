import { FIGURE_POSITION_TARGET_IDS } from '~/domain/script/types'

import type { SayCommandNode } from '~/domain/script/types'

export function readSayFigureTargetId(node: SayCommandNode): string | undefined {
  if (node.figureId?.trim()) {
    return node.figureId
  }
  return node.figurePosition
    ? FIGURE_POSITION_TARGET_IDS[node.figurePosition]
    : undefined
}

export function updateSayFigureTargetId(
  node: SayCommandNode,
  value: string,
): SayCommandNode {
  return {
    ...node,
    figureId: value.trim() || undefined,
    figurePosition: undefined,
  }
}
