import { isEditableEditor, useEditorStore } from '~/stores/editor'
import { useTabsStore } from '~/stores/tabs'

interface UseVisualEditorFocusRequestOptions {
  path: MaybeRefOrGetter<string>
  resolveFocusTarget?: (root: HTMLElement) => HTMLElement | undefined
  rootElement: MaybeRefOrGetter<HTMLElement | null | undefined>
}

export function useVisualEditorFocusRequest(options: UseVisualEditorFocusRequestOptions) {
  const editorStore = useEditorStore()
  const tabsStore = useTabsStore()

  const path = computed(() => toValue(options.path))
  const rootElement = computed(() => toValue(options.rootElement))
  const isCurrentVisualSurfaceActive = computed(() => {
    const currentState = editorStore.currentState
    return currentState !== undefined
      && isEditableEditor(currentState)
      && currentState.projection === 'visual'
      && currentState.path === path.value
      && tabsStore.activeTab?.path === path.value
  })

  async function restoreFocus(): Promise<void> {
    await nextTick()
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })

    const root = rootElement.value
    if (!(root instanceof HTMLElement)) {
      return
    }

    const target = options.resolveFocusTarget?.(root) ?? root
    target.focus()
    tabsStore.shouldFocusEditor = false
  }

  watch(
    [
      () => tabsStore.shouldFocusEditor,
      isCurrentVisualSurfaceActive,
      rootElement,
    ],
    ([shouldFocus, isActive, root]) => {
      if (!shouldFocus || !isActive || !(root instanceof HTMLElement)) {
        return
      }

      void restoreFocus()
    },
    { immediate: true },
  )
}
