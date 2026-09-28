import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { useShortcutContextRegistry } from '~/features/editor/shortcut/shortcut-context-registry'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'
import { useShortcutDispatcher } from '~/features/editor/shortcut/useShortcutDispatcher'

import EffectEditorSubDialog from './EffectEditorSubDialog.vue'

import type { Transform } from '~/domain/stage/types'
import type { useEffectEditorDialog } from '~/features/editor/effect-editor/useEffectEditorDialog'

type EffectDialog = ReturnType<typeof useEffectEditorDialog>

function createEffectDialogMock(overrides: Partial<EffectDialog> = {}): EffectDialog {
  const draftTransform: Transform = { alpha: 0.2 }

  return {
    draftDuration: '',
    draftEase: '',
    draftTransform,
    flipScaleAxis: vi.fn(),
    handleApply: vi.fn(),
    handleCancel: vi.fn(),
    handleTransformUpdate: vi.fn(),
    isDefault: false,
    isDirty: false,
    isOpen: true,
    copyCurrentEffect: vi.fn(() => true),
    pasteCurrentEffect: vi.fn(() => true),
    requestClose: vi.fn(),
    resetToDefault: vi.fn(),
    updateDuration: vi.fn(),
    updateEase: vi.fn(),
    ...overrides,
  }
}

const EffectEditorPanelStub = defineComponent({
  name: 'StubEffectEditorPanel',
  setup() {
    return () => h('div', {
      'data-testid': 'effect-editor-panel',
      'tabindex': -1,
    }, 'effect-editor-panel')
  },
})

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  DialogDescription: createBrowserContainerStub('StubDialogDescription', 'p'),
  DialogFooter: createBrowserContainerStub('StubDialogFooter', 'footer'),
  DialogHeader: createBrowserContainerStub('StubDialogHeader', 'header'),
  DialogTitle: createBrowserContainerStub('StubDialogTitle', 'h2'),
  EffectEditorPanel: EffectEditorPanelStub,
}

function createHarness(dialog: EffectDialog) {
  return defineComponent({
    name: 'EffectEditorSubDialogHarness',
    setup() {
      useShortcutDispatcher({
        bindings: [],
        executeContext: undefined,
        platform: 'windows',
      })

      // 模态宿主打开期间窗口级 isModalOpen 为 true，绑定必须显式放行模态场景
      useShortcutContext({ isModalOpen: true })

      return () => h(EffectEditorSubDialog, { effectDialog: dialog })
    },
  })
}

async function renderSubDialog(dialog: EffectDialog) {
  await renderInBrowser(createHarness(dialog), {
    global: {
      stubs: globalStubs,
    },
  })

  const panel = page.getByTestId('effect-editor-panel')
  await expect.element(panel).toBeVisible()
  const panelElement = await panel.element()
  panelElement.focus()

  return panel
}

describe('EffectEditorSubDialog', () => {
  it('聚焦模态框里的编辑器时接管效果编辑器焦点上下文', async () => {
    const dialog = createEffectDialogMock()

    await renderSubDialog(dialog)

    await vi.waitFor(() => {
      expect(useShortcutContextRegistry().resolveContext().panelFocus).toBe('effectEditor')
    })
  })

  it('打开后聚焦编辑器面板而不是第一个输入框', async () => {
    const dialog = reactive(createEffectDialogMock({ isOpen: false }))

    await renderInBrowser(createHarness(dialog), {
      global: {
        stubs: globalStubs,
      },
    })

    dialog.isOpen = true
    await expect.element(page.getByTestId('effect-editor-panel')).toBeVisible()

    // 焦点落在面板表面：落在输入框会让只在非输入态生效的快捷键整片失效
    await vi.waitFor(() => {
      expect(document.activeElement).not.toBe(document.body)
      expect(document.activeElement?.tagName).not.toBe('INPUT')
    })
  })

  it('模态框里响应复制、翻转与应用快捷键', async () => {
    const dialog = createEffectDialogMock()

    await renderSubDialog(dialog)
    await vi.waitFor(() => {
      expect(useShortcutContextRegistry().resolveContext().panelFocus).toBe('effectEditor')
    })

    globalThis.dispatchEvent(new KeyboardEvent('keydown', {
      ctrlKey: true,
      key: 'c',
    }))
    globalThis.dispatchEvent(new KeyboardEvent('keydown', {
      shiftKey: true,
      key: 'H',
    }))
    globalThis.dispatchEvent(new KeyboardEvent('keydown', {
      ctrlKey: true,
      key: 'Enter',
    }))

    expect(dialog.copyCurrentEffect).toHaveBeenCalledOnce()
    expect(dialog.flipScaleAxis).toHaveBeenCalledWith('x')
    expect(dialog.handleApply).toHaveBeenCalledOnce()
  })

  it('模态宿主没有撤销体系，因此不响应撤销与重做快捷键', async () => {
    const dialog = createEffectDialogMock()

    await renderSubDialog(dialog)
    await vi.waitFor(() => {
      expect(useShortcutContextRegistry().resolveContext().panelFocus).toBe('effectEditor')
    })

    const handled: boolean[] = []
    globalThis.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'z') {
        return
      }
      handled.push(event.defaultPrevented)
    })

    globalThis.dispatchEvent(new KeyboardEvent('keydown', {
      ctrlKey: true,
      key: 'z',
    }))
    globalThis.dispatchEvent(new KeyboardEvent('keydown', {
      ctrlKey: true,
      shiftKey: true,
      key: 'Z',
    }))

    // 模态框宿主自己没有撤销体系，子对话框不应单独接管这两个键
    expect(handled).toEqual([false, false])
    expect(dialog.handleTransformUpdate).not.toHaveBeenCalled()
  })

  it('对话框关闭后不再占用快捷键上下文', async () => {
    const dialog = createEffectDialogMock({ isOpen: false })

    await renderInBrowser(createHarness(dialog), {
      global: {
        stubs: globalStubs,
      },
    })

    expect(useShortcutContextRegistry().resolveContext().panelFocus).not.toBe('effectEditor')
  })
})
