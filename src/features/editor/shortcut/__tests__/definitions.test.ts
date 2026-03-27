import { describe, expect, it, vi } from 'vitest'

import { createEditorShortcutDefinitions } from '../definitions'

describe('editor shortcut definitions', () => {
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
})
