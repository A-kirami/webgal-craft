import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { defineComponent, h, ref } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'
import CommandPanelCard from '~/components/editor/CommandPanelCard.vue'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { TooltipProvider } from '~/components/ui/tooltip'

import { createEditorShortcutDefinitions } from '../definitions'
import { useShortcutContextRegistry } from '../shortcut-context-registry'
import { useShortcut } from '../useShortcut'
import { useShortcutContext } from '../useShortcutContext'
import { useShortcutDispatcher } from '../useShortcutDispatcher'

import type { ComponentPublicInstance } from 'vue'

const shortcutActions = vi.hoisted(() => ({
  rename: vi.fn(),
  save: vi.fn(),
  setLeftPanelView: vi.fn(),
  toggleCommandPanel: vi.fn(),
  togglePreviewPanel: vi.fn(),
  toggleSidebar: vi.fn(),
  undo: vi.fn(),
}))

function createHarnessComponent() {
  const FileTreeShortcutTarget = defineComponent({
    name: 'FileTreeShortcutTarget',
    setup() {
      const targetRef = ref<HTMLButtonElement>()

      useShortcutContext({
        panelFocus: 'fileTree',
      }, {
        target: targetRef,
        trackFocus: true,
      })

      useShortcut({
        execute: () => {
          shortcutActions.rename()
        },
        i18nKey: 'shortcut.fileTree.rename',
        id: 'fileTree.rename',
        keys: 'F2',
        when: {
          panelFocus: 'fileTree',
        },
      })

      return () => h('button', {
        ref: targetRef,
        type: 'button',
      }, 'file-tree')
    },
  })

  const PreventedInputTarget = defineComponent({
    name: 'PreventedInputTarget',
    setup() {
      const targetRef = ref<HTMLInputElement>()

      function handleKeydown(event: KeyboardEvent) {
        if (event.ctrlKey && event.key.toLowerCase() === 'p') {
          event.preventDefault()
        }
      }

      return () => h('input', {
        ref: targetRef,
        onKeydown: handleKeydown,
        type: 'text',
      })
    },
  })

  return defineComponent({
    name: 'ShortcutDispatcherHarness',
    setup() {
      useShortcutDispatcher({
        bindings: createEditorShortcutDefinitions(),
        executeContext: {
          saveCurrentFile: shortcutActions.save,
          setLeftPanelView: shortcutActions.setLeftPanelView,
          toggleCommandPanel: shortcutActions.toggleCommandPanel,
          togglePreviewPanel: shortcutActions.togglePreviewPanel,
          toggleSidebar: shortcutActions.toggleSidebar,
        },
        platform: 'windows',
      })

      useShortcutContext({
        commandPanelOpen: false,
        editorMode: 'visual',
        hasSelection: true,
        isDirty: true,
        isModalOpen: false,
        panelFocus: 'none',
        visualType: 'scene',
      })

      return () => h('div', [
        h(FileTreeShortcutTarget),
        h(PreventedInputTarget),
      ])
    },
  })
}

function createFocusIsolationHarnessComponent() {
  const EditorShortcutTarget = defineComponent({
    name: 'EditorShortcutTarget',
    setup() {
      const targetRef = ref<HTMLButtonElement>()

      useShortcutContext({
        panelFocus: 'editor',
      }, {
        target: targetRef,
        trackFocus: true,
      })

      useShortcut({
        execute: () => {
          shortcutActions.undo()
        },
        i18nKey: 'shortcut.visual.undo',
        id: 'visual.undo',
        keys: 'Mod+Z',
        when: {
          panelFocus: 'editor',
          visualType: 'scene',
        },
      })

      return () => h('button', {
        ref: targetRef,
        type: 'button',
      }, 'editor-surface')
    },
  })

  const CommandPanelTarget = defineComponent({
    name: 'CommandPanelTarget',
    setup() {
      useShortcutContext({
        panelFocus: 'commandPanel',
      }, {
        trackFocus: true,
      })

      return () => h(TooltipProvider, {}, {
        default: () => h(CommandPanelCard, {
          title: 'command-panel-card',
          onClick: () => undefined,
        }),
      })
    },
  })

  const UnregisteredTabsTarget = defineComponent({
    name: 'UnregisteredTabsTarget',
    setup() {
      const activeTab = ref('scene')

      return () => h(Tabs, {
        'modelValue': activeTab.value,
        'onUpdate:modelValue': (value: string | number) => {
          activeTab.value = String(value)
        },
      }, {
        default: () => [
          h(TabsList, {}, {
            default: () => [
              h(TabsTrigger, { value: 'scene' }, { default: () => 'scene' }),
              h(TabsTrigger, { value: 'resource' }, { default: () => 'resource' }),
            ],
          }),
        ],
      })
    },
  })

  return defineComponent({
    name: 'ShortcutFocusIsolationHarness',
    setup() {
      useShortcutDispatcher({
        bindings: [],
        executeContext: {},
        platform: 'windows',
      })

      useShortcutContext({
        panelFocus: 'none',
        visualType: 'scene',
      })

      return () => h('div', [
        h(EditorShortcutTarget),
        h(CommandPanelTarget),
        h(UnregisteredTabsTarget),
      ])
    },
  })
}

function createStatementEditorSelectHarnessComponent() {
  const StatementEditorSelectTarget = defineComponent({
    name: 'StatementEditorSelectTarget',
    setup() {
      const targetRef = ref<HTMLDivElement>()
      const modelValue = ref('hero')

      useShortcutContext({
        panelFocus: 'statementEditor',
      }, {
        target: targetRef,
        trackFocus: true,
      })

      useShortcut({
        allowInInput: true,
        execute: () => {
          shortcutActions.undo()
        },
        i18nKey: 'shortcut.statementEditor.undo',
        id: 'statementEditor.undo',
        keys: 'Mod+Z',
        when: {
          panelFocus: 'statementEditor',
        },
      })

      return () => h('div', {
        ref: targetRef,
      }, [
        h(Select, {
          'modelValue': modelValue.value,
          'onUpdate:modelValue': (value: unknown) => {
            modelValue.value = String(value ?? '')
          },
        }, {
          default: () => [
            h(SelectTrigger, {
              id: 'statement-editor-select',
            }, {
              default: () => h(SelectValue, {
                placeholder: 'select-option',
              }),
            }),
            h(SelectContent, {}, {
              default: () => [
                h(SelectItem, { value: 'hero' }, { default: () => 'Hero' }),
                h(SelectItem, { value: 'villain' }, { default: () => 'Villain' }),
              ],
            }),
          ],
        }),
      ])
    },
  })

  return defineComponent({
    name: 'StatementEditorSelectHarness',
    setup() {
      useShortcutDispatcher({
        bindings: [],
        executeContext: {},
        platform: 'windows',
      })

      useShortcutContext({
        panelFocus: 'none',
      })

      return () => h(StatementEditorSelectTarget)
    },
  })
}

function createComponentTargetHarnessComponent() {
  const ValueExposedButton = defineComponent({
    name: 'ValueExposedButton',
    setup(_, { expose }) {
      expose({
        value: 'component-value',
      })

      return () => h('button', {
        type: 'button',
      }, 'value-target')
    },
  })

  const ComponentTargetShortcut = defineComponent({
    name: 'ComponentTargetShortcut',
    setup() {
      const targetRef = ref<ComponentPublicInstance>()

      useShortcutContext({
        panelFocus: 'fileTree',
      }, {
        target: targetRef,
        trackFocus: true,
      })

      useShortcut({
        execute: () => {
          shortcutActions.rename()
        },
        i18nKey: 'shortcut.fileTree.rename',
        id: 'fileTree.rename',
        keys: 'F2',
        when: {
          panelFocus: 'fileTree',
        },
      })

      return () => h(ValueExposedButton, {
        ref: targetRef,
      })
    },
  })

  return defineComponent({
    name: 'ComponentTargetHarness',
    setup() {
      useShortcutDispatcher({
        bindings: [],
        executeContext: {},
        platform: 'windows',
      })

      useShortcutContext({
        panelFocus: 'none',
      })

      return () => h(ComponentTargetShortcut)
    },
  })
}

describe('useShortcutDispatcher 的浏览器分发行为', () => {
  beforeEach(() => {
    for (const action of Object.values(shortcutActions)) {
      action.mockReset()
    }
  })

  it('会响应静态注册的全局快捷键', async () => {
    renderInBrowser(createHarnessComponent(), {
      global: {
        plugins: [createPinia()],
      },
    })

    await userEvent.keyboard('{Control>}s{/Control}')

    expect(shortcutActions.save).toHaveBeenCalledOnce()
  })

  it('会响应命令面板切换快捷键', async () => {
    renderInBrowser(createHarnessComponent(), {
      global: {
        plugins: [createPinia()],
      },
    })

    await userEvent.keyboard('{Control>}p{/Control}')

    expect(shortcutActions.toggleCommandPanel).toHaveBeenCalledOnce()
  })

  it('事件已被焦点元素 preventDefault 时仍会响应允许穿透的全局快捷键', async () => {
    renderInBrowser(createHarnessComponent(), {
      global: {
        plugins: [createPinia()],
      },
    })

    const input = page.getByRole('textbox')
    const inputElement = await input.element()
    inputElement.focus()
    await userEvent.keyboard('{Control>}p{/Control}')

    expect(shortcutActions.toggleCommandPanel).toHaveBeenCalledOnce()
  })

  it('会在焦点上下文满足时响应动态注册的组件快捷键', async () => {
    renderInBrowser(createHarnessComponent(), {
      global: {
        plugins: [createPinia()],
      },
    })

    const button = page.getByRole('button', { name: 'file-tree' })
    const buttonElement = await button.element()
    buttonElement.focus()
    await userEvent.keyboard('{F2}')

    expect(shortcutActions.rename).toHaveBeenCalledOnce()
  })

  it('组件实例公开 value 字段时，仍会解析到真实焦点元素', async () => {
    renderInBrowser(createComponentTargetHarnessComponent(), {
      global: {
        plugins: [createPinia()],
      },
    })

    const button = page.getByRole('button', { name: 'value-target' })
    const buttonElement = await button.element()
    buttonElement.focus()
    await userEvent.keyboard('{F2}')

    expect(shortcutActions.rename).toHaveBeenCalledOnce()
  })

  it('点击命令面板卡片后，立即按键不应继续命中 editor undo', async () => {
    renderInBrowser(createFocusIsolationHarnessComponent(), {
      global: {
        plugins: [createPinia()],
      },
    })

    const editorButton = page.getByRole('button', { name: 'editor-surface' })
    const commandPanelCard = page.getByRole('button', { name: 'command-panel-card' })

    await editorButton.click()
    const commandPanelElement = await commandPanelCard.element()
    commandPanelElement.focus()
    commandPanelElement.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      ctrlKey: true,
      key: 'z',
    }))

    expect(shortcutActions.undo).not.toHaveBeenCalled()
  })

  it('点击未注册的 TabsTrigger 后，立即按键不应继续命中 editor undo', async () => {
    renderInBrowser(createFocusIsolationHarnessComponent(), {
      global: {
        plugins: [createPinia()],
      },
    })

    const editorButton = page.getByRole('button', { name: 'editor-surface' })
    const resourceTab = page.getByRole('tab', { name: 'resource' })

    await editorButton.click()
    const resourceTabElement = await resourceTab.element()
    resourceTabElement.focus()
    resourceTabElement.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      ctrlKey: true,
      key: 'z',
    }))

    expect(shortcutActions.undo).not.toHaveBeenCalled()
  })

  it('语句编辑器 Select 选择后会保持快捷键焦点上下文', async () => {
    renderInBrowser(createStatementEditorSelectHarnessComponent(), {
      global: {
        plugins: [createPinia()],
      },
    })

    const trigger = page.getByRole('combobox')

    await trigger.click()
    await page.getByRole('option', { name: 'Villain' }).click()
    const triggerElement = await trigger.element()

    await vi.waitFor(() => {
      expect(document.activeElement).toBe(triggerElement)
    })
    expect(useShortcutContextRegistry().resolveContext().panelFocus).toBe('statementEditor')

    triggerElement.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      ctrlKey: true,
      key: 'z',
    }))

    expect(shortcutActions.undo).toHaveBeenCalledOnce()
  })
})
