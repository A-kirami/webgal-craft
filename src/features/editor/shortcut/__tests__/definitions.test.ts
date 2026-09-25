import { beforeEach, describe, expect, it, vi } from 'vitest'

const { handleErrorMock } = vi.hoisted(() => ({
  handleErrorMock: vi.fn(),
}))

vi.mock('~/utils/error-handler', () => ({
  handleError: handleErrorMock,
}))

import { createEditorShortcutDefinitions } from '../definitions'

describe('createEditorShortcutDefinitions', () => {
  beforeEach(() => {
    handleErrorMock.mockReset()
  })

  it('提供完整的全局编辑页快捷键定义', () => {
    const definitions = createEditorShortcutDefinitions()

    expect(definitions.map(item => item.id)).toEqual([
      'editor.save',
      'editor.commandPanel',
      'editor.toggleSidebar',
      'editor.togglePreview',
      'editor.sidebarScene',
      'editor.sidebarResource',
    ])

    expect(definitions.find(item => item.id === 'editor.save')).toMatchObject({
      keys: 'Mod+S',
      overrideMonaco: true,
      when: { editorMode: '!none' },
    })
    expect(definitions.find(item => item.id === 'editor.commandPanel')).toMatchObject({
      keys: 'Mod+P',
      overrideMonaco: true,
    })
    // ⌘Q 在 macOS 由系统默认菜单用于退出应用，预览面板开关改用 VS Code 同义的 ⌘J
    expect(definitions.find(item => item.id === 'editor.togglePreview')).toMatchObject({
      keys: 'Mod+J',
      overrideMonaco: true,
    })
  })

  it('全局快捷键避开 macOS 默认菜单占用的键位', () => {
    // 未设置 menu 时 Tauri 会在 macOS 自动创建默认菜单，muda 的 PredefinedMenuItem
    // 把 ⌘Q / ⌘W / ⌘H / ⌘M 以及 Edit 菜单的 ⌘Z / ⌘C / ⌘X / ⌘V / ⌘A / ⇧⌘Z 注册为原生快捷键，
    // 同键的应用绑定会被菜单抢占（⌘Q 会直接退出应用），因此全局绑定不得占用这些组合。
    const reservedKeys = new Set([
      'Mod+Q',
      'Mod+W',
      'Mod+H',
      'Mod+M',
      'Mod+Z',
      'Mod+C',
      'Mod+X',
      'Mod+V',
      'Mod+A',
      'Mod+Shift+Z',
      'Mod+Alt+H',
      'Ctrl+Mod+F',
    ])

    for (const definition of createEditorShortcutDefinitions()) {
      const keys = Array.isArray(definition.keys) ? definition.keys : [definition.keys]
      expect(keys.filter(key => reservedKeys.has(key))).toEqual([])
    }
  })

  it('执行静态快捷键时会调用对应页面动作', () => {
    const runtime = {
      saveCurrentFile: vi.fn(),
      setLeftPanelView: vi.fn(),
      toggleCommandPanel: vi.fn(),
      togglePreviewPanel: vi.fn(),
      toggleSidebar: vi.fn(),
    }

    const definitions = createEditorShortcutDefinitions()

    definitions.find(item => item.id === 'editor.save')?.execute(runtime)
    definitions.find(item => item.id === 'editor.commandPanel')?.execute(runtime)
    definitions.find(item => item.id === 'editor.toggleSidebar')?.execute(runtime)
    definitions.find(item => item.id === 'editor.togglePreview')?.execute(runtime)
    definitions.find(item => item.id === 'editor.sidebarScene')?.execute(runtime)
    definitions.find(item => item.id === 'editor.sidebarResource')?.execute(runtime)

    expect(runtime.saveCurrentFile).toHaveBeenCalledOnce()
    expect(runtime.toggleCommandPanel).toHaveBeenCalledOnce()
    expect(runtime.toggleSidebar).toHaveBeenCalledOnce()
    expect(runtime.togglePreviewPanel).toHaveBeenCalledOnce()
    expect(runtime.setLeftPanelView).toHaveBeenNthCalledWith(1, 'scene')
    expect(runtime.setLeftPanelView).toHaveBeenNthCalledWith(2, 'resource')
  })

  it('保存快捷键失败时会静默交给统一错误处理', async () => {
    const saveError = new Error('save failed')
    const runtime = {
      saveCurrentFile: vi.fn().mockRejectedValueOnce(saveError),
      setLeftPanelView: vi.fn(),
      toggleCommandPanel: vi.fn(),
      togglePreviewPanel: vi.fn(),
      toggleSidebar: vi.fn(),
    }

    const definitions = createEditorShortcutDefinitions()

    definitions.find(item => item.id === 'editor.save')?.execute(runtime)
    await Promise.resolve()

    expect(runtime.saveCurrentFile).toHaveBeenCalledOnce()
    expect(handleErrorMock).toHaveBeenCalledOnce()
    expect(handleErrorMock).toHaveBeenCalledWith(saveError, { silent: true })
  })
})
