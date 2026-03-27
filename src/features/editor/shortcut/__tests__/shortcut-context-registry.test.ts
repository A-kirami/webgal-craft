import { beforeEach, describe, expect, it } from 'vitest'

import '~/__tests__/setup'

import { useShortcutContextRegistry } from '../shortcut-context-registry'

describe('useShortcutContextRegistry 的上下文注册表', () => {
  let store: ReturnType<typeof useShortcutContextRegistry>

  beforeEach(() => {
    store = useShortcutContextRegistry()
  })

  it('按注册顺序合并上下文，并在注销后恢复之前的值', () => {
    const baseToken = store.registerEntry()
    store.updateEntry(baseToken, {
      editorMode: 'none',
      panelFocus: 'none',
    })

    const focusToken = store.registerEntry()
    store.updateEntry(focusToken, {
      editorMode: 'visual',
      panelFocus: 'editor',
    })

    expect(store.resolveContext().editorMode).toBe('visual')
    expect(store.resolveContext().panelFocus).toBe('editor')

    store.unregisterEntry(focusToken)

    expect(store.resolveContext().editorMode).toBe('none')
    expect(store.resolveContext().panelFocus).toBe('none')
  })

  it('停用条目后不会继续覆盖当前上下文', () => {
    const baseToken = store.registerEntry()
    store.updateEntry(baseToken, {
      panelFocus: 'none',
    })

    const inactiveToken = store.registerEntry()
    store.updateEntry(inactiveToken, {
      panelFocus: 'fileTree',
    }, {
      active: false,
    })

    expect(store.resolveContext().panelFocus).toBe('none')

    store.updateEntry(inactiveToken, {
      panelFocus: 'fileTree',
    }, {
      active: true,
    })

    expect(store.resolveContext().panelFocus).toBe('fileTree')
  })

  it('任一活跃条目声明模态框打开时，isModalOpen 会保持为 true', () => {
    const pageToken = store.registerEntry()
    store.updateEntry(pageToken, {
      isModalOpen: true,
    })

    const localDialogToken = store.registerEntry()
    store.updateEntry(localDialogToken, {
      isModalOpen: false,
    })

    expect(store.resolveContext().isModalOpen).toBe(true)

    store.updateEntry(pageToken, {
      isModalOpen: false,
    })

    expect(store.resolveContext().isModalOpen).toBe(false)
  })

  it('resolveContext 会基于 trackFocus 目标返回当前焦点上下文', () => {
    const baseToken = store.registerEntry()
    store.updateEntry(baseToken, {
      panelFocus: 'none',
    })

    const editorTarget = {
      contains(node: unknown) {
        return node === editorFocusNode
      },
    } as HTMLElement
    const editorFocusNode = {
      nodeType: 1,
    } as Node as EventTarget
    const otherFocusNode = {
      nodeType: 1,
    } as Node as EventTarget

    const editorToken = store.registerEntry()
    store.updateEntry(editorToken, {
      panelFocus: 'editor',
    }, {
      target: editorTarget,
      trackFocus: true,
    })

    expect(store.resolveContext(editorFocusNode).panelFocus).toBe('editor')
    expect(store.resolveContext(otherFocusNode).panelFocus).toBe('none')
  })
})
