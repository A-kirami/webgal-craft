interface RefLike<T> {
  readonly value: T
}

interface ResizablePanelStateLike {
  isCollapsed?: boolean | RefLike<boolean>
}

export function readResizablePanelCollapsed(
  panel: ResizablePanelStateLike | null | undefined,
): boolean {
  const collapsed = panel?.isCollapsed
  if (typeof collapsed === 'object' && collapsed !== null && 'value' in collapsed) {
    return Boolean(collapsed.value)
  }

  return Boolean(collapsed)
}
