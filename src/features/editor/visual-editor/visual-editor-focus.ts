interface FocusStateElementLike {
  isContentEditable?: boolean
  tagName?: string
}

interface QueryableRoot<TElement> {
  querySelector: (selector: string) => TElement | null
}

export function canRestoreVisualEditorCardFocus(activeElement: FocusStateElementLike | null | undefined): boolean {
  if (!activeElement) {
    return true
  }

  const tagName = activeElement.tagName?.toUpperCase()
  if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
    return false
  }

  return !activeElement.isContentEditable
}

export function findSelectedVisualEditorStatementCard<TElement>(root: QueryableRoot<TElement>): TElement | undefined {
  return root.querySelector('[role="option"][aria-selected="true"]') ?? undefined
}

export function findSelectedVisualEditorAnimationFrame<TElement>(root: QueryableRoot<TElement>): TElement | undefined {
  return root.querySelector('[data-animation-frame-selected="true"]') ?? undefined
}
