import { describe, expect, it, vi } from 'vitest'

const { handleErrorMock } = vi.hoisted(() => ({
  handleErrorMock: vi.fn(),
}))

vi.mock('~/utils/error-handler', () => ({
  handleError: handleErrorMock,
}))

import {
  dispatchShortcut,
  matchesShortcutWhen,
} from '../dispatcher'
import {
  normalizeShortcutBindingKey,
  normalizeShortcutBindingKeys,
  normalizeShortcutEventKeys,
} from '../keys'

import type { ShortcutDefinition } from '../types'

interface ShortcutTestEvent {
  altKey: boolean
  ctrlKey: boolean
  defaultPrevented?: boolean
  key: string
  metaKey: boolean
  preventDefault: () => void
  shiftKey: boolean
  target?: EventTarget | null
}

function createKeyboardEvent(
  overrides: Partial<Omit<ShortcutTestEvent, 'preventDefault'>> = {},
): ShortcutTestEvent {
  const preventDefault = vi.fn(() => undefined)

  return {
    altKey: false,
    ctrlKey: false,
    key: '',
    metaKey: false,
    preventDefault,
    shiftKey: false,
    target: undefined,
    ...overrides,
  }
}

function createTarget(options: {
  closestSelectors?: string[]
  isContentEditable?: boolean
  tagName?: string
} = {}): EventTarget {
  const closestSelectors = new Set(options.closestSelectors)
  return {
    closest(selector: string) {
      return closestSelectors.has(selector) ? {} : undefined
    },
    isContentEditable: options.isContentEditable ?? false,
    tagName: options.tagName ?? 'DIV',
  } as unknown as EventTarget
}

function createBinding(
  overrides: Partial<ShortcutDefinition<{ call: (id: string) => void }>>,
): ShortcutDefinition<{ call: (id: string) => void }> {
  return {
    execute: ({ call }) => {
      call(String(overrides.id))
    },
    i18nKey: 'shortcut.test',
    id: 'shortcut.test',
    keys: 'Mod+S',
    ...overrides,
  }
}

describe('dispatchShortcut 与快捷键匹配工具函数', () => {
  it('标准化绑定与按键事件时会统一 Mod 和修饰键顺序', () => {
    expect(normalizeShortcutBindingKeys(['Shift+Mod+S', 'mod+y'], 'windows')).toEqual([
      'Ctrl+Shift+S',
      'Ctrl+Y',
    ])
    expect(normalizeShortcutBindingKeys('shift+mod+s', 'mac')).toEqual(['Meta+Shift+S'])

    expect(normalizeShortcutEventKeys(createKeyboardEvent({
      ctrlKey: true,
      key: 's',
      shiftKey: true,
    }))).toBe('Ctrl+Shift+S')
    expect(normalizeShortcutEventKeys(createKeyboardEvent({
      key: 'ArrowDown',
      metaKey: true,
    }))).toBe('Meta+ArrowDown')
  })

  it('按下修饰键本身时不会生成伪快捷键', () => {
    expect(normalizeShortcutEventKeys(createKeyboardEvent({
      ctrlKey: true,
      key: 'Control',
    }))).toBe('')
  })

  it('绑定包含多个非修饰键时会被视为无效', () => {
    expect(normalizeShortcutBindingKey('Ctrl+K+P', 'windows')).toBe('')
  })

  it('when 条件支持等值匹配和 !value 否定语法', () => {
    expect(matchesShortcutWhen(
      { editorMode: 'visual', hasSelection: true, visualType: '!animation' },
      { editorMode: 'visual', hasSelection: true, visualType: 'scene' },
    )).toBe(true)

    expect(matchesShortcutWhen(
      { editorMode: 'visual', visualType: '!animation' },
      { editorMode: 'visual', visualType: 'animation' },
    )).toBe(false)
  })

  it('优先执行特异性更高的绑定，同特异性下后注册优先', () => {
    const call = vi.fn()
    const event = createKeyboardEvent({
      ctrlKey: true,
      key: 's',
    })

    const handled = dispatchShortcut({
      bindings: [
        createBinding({ id: 'editor.save' }),
        createBinding({
          id: 'editor.save-dirty',
          when: { editorMode: 'visual', isDirty: true },
        }),
        createBinding({
          id: 'editor.save-dirty-late',
          when: { editorMode: 'visual', isDirty: true },
        }),
      ],
      context: {
        editorMode: 'visual',
        isDirty: true,
      },
      event,
      executeContext: { call },
      platform: 'windows',
    })

    expect(handled).toBe(true)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(call).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledWith('editor.save-dirty-late')
  })

  it('模态框、输入元素和 Monaco 焦点会按声明过滤绑定', () => {
    const call = vi.fn()

    const modalHandled = dispatchShortcut({
      bindings: [createBinding({ id: 'editor.save' })],
      context: {
        editorMode: 'text',
        isModalOpen: true,
      },
      event: createKeyboardEvent({
        ctrlKey: true,
        key: 's',
      }),
      executeContext: { call },
      platform: 'windows',
    })

    const inputHandled = dispatchShortcut({
      bindings: [createBinding({ id: 'visual.delete', keys: 'Delete' })],
      context: {
        panelFocus: 'statementEditor',
      },
      event: createKeyboardEvent({
        key: 'Delete',
        target: createTarget({ tagName: 'INPUT' }),
      }),
      executeContext: { call },
      platform: 'windows',
    })

    const monacoHandled = dispatchShortcut({
      bindings: [createBinding({ id: 'editor.commandPanel', keys: 'Mod+P' })],
      context: {
        editorMode: 'text',
      },
      event: createKeyboardEvent({
        ctrlKey: true,
        key: 'p',
        target: createTarget({ closestSelectors: ['.monaco-editor'] }),
      }),
      executeContext: { call },
      platform: 'windows',
    })

    expect(modalHandled).toBe(false)
    expect(inputHandled).toBe(false)
    expect(monacoHandled).toBe(false)
    expect(call).not.toHaveBeenCalled()
  })

  it('allowInModal、allowInInput 和 overrideMonaco 会显式放开过滤', () => {
    const call = vi.fn()

    const handled = dispatchShortcut({
      bindings: [
        createBinding({
          allowInInput: true,
          allowInModal: true,
          id: 'effect.apply',
          keys: 'Mod+Enter',
          overrideMonaco: true,
        }),
      ],
      context: {
        isModalOpen: true,
        panelFocus: 'effectEditor',
      },
      event: createKeyboardEvent({
        ctrlKey: true,
        key: 'Enter',
        target: createTarget({
          closestSelectors: ['.monaco-editor'],
          tagName: 'TEXTAREA',
        }),
      }),
      executeContext: { call },
      platform: 'windows',
    })

    expect(handled).toBe(true)
    expect(call).toHaveBeenCalledWith('effect.apply')
  })

  it('overrideMonaco 会放行 Monaco 文本输入目标，即使未声明 allowInInput', () => {
    const call = vi.fn()

    const handled = dispatchShortcut({
      bindings: [
        createBinding({
          id: 'editor.commandPanel',
          keys: 'Mod+P',
          overrideMonaco: true,
        }),
      ],
      context: {
        editorMode: 'text',
      },
      event: createKeyboardEvent({
        ctrlKey: true,
        key: 'p',
        target: createTarget({
          closestSelectors: ['.monaco-editor'],
          tagName: 'TEXTAREA',
        }),
      }),
      executeContext: { call },
      platform: 'windows',
    })

    expect(handled).toBe(true)
    expect(call).toHaveBeenCalledWith('editor.commandPanel')
  })

  it('事件已被 preventDefault 时仍会继续匹配显式允许穿透焦点环境的快捷键', () => {
    const call = vi.fn()

    const handled = dispatchShortcut({
      bindings: [
        createBinding({
          allowInInput: true,
          id: 'editor.commandPanel',
          keys: 'Mod+P',
          overrideMonaco: true,
        }),
      ],
      context: {
        editorMode: 'text',
      },
      event: createKeyboardEvent({
        ctrlKey: true,
        defaultPrevented: true,
        key: 'p',
        target: createTarget({
          closestSelectors: ['.monaco-editor'],
          tagName: 'TEXTAREA',
        }),
      }),
      executeContext: { call },
      platform: 'windows',
    })

    expect(handled).toBe(true)
    expect(call).toHaveBeenCalledWith('editor.commandPanel')
  })

  it('快捷键执行返回 rejected Promise 时会静默记录错误', async () => {
    const error = new Error('save failed')

    const handled = dispatchShortcut({
      bindings: [
        createBinding({
          execute: () => Promise.reject(error),
          id: 'editor.save',
        }),
      ],
      context: {
        editorMode: 'visual',
      },
      event: createKeyboardEvent({
        ctrlKey: true,
        key: 's',
      }),
      executeContext: { call: vi.fn() },
      platform: 'windows',
    })

    await Promise.resolve()

    expect(handled).toBe(true)
    expect(handleErrorMock).toHaveBeenCalledWith(error, { silent: true })
  })
})
