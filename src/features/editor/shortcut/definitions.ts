import { handleError } from '~/utils/error-handler'

import type { ShortcutDefinition } from './types'

export interface EditorShortcutRuntime {
  saveCurrentFile: () => void | Promise<void>
  setLeftPanelView: (view: 'resource' | 'scene') => void
  toggleCommandPanel: () => void
  togglePreviewPanel: () => void
  toggleSidebar: () => void
}

export function createEditorShortcutDefinitions(): ShortcutDefinition<EditorShortcutRuntime>[] {
  return [
    {
      allowInInput: true,
      execute: ({ saveCurrentFile }) => {
        void (async () => {
          try {
            await saveCurrentFile()
          } catch (error) {
            handleError(error, { silent: true })
          }
        })()
      },
      i18nKey: 'shortcut.save',
      id: 'editor.save',
      keys: 'Mod+S',
      overrideMonaco: true,
      // 效果编辑器会话拥有运行时预览，保存会让运行时重跑场景并冲掉未应用的草稿预览：
      // 该键位在抽屉会话期间被独占键盘的编辑器抽屉整体挡下（见 allowInEditorDrawer）
      when: { editorMode: '!none' },
    },
    {
      allowInInput: true,
      execute: ({ toggleCommandPanel }) => {
        toggleCommandPanel()
      },
      i18nKey: 'shortcut.commandPanel',
      id: 'editor.commandPanel',
      keys: 'Mod+P',
      overrideMonaco: true,
      when: { editorMode: '!none' },
    },
    {
      allowInInput: true,
      execute: ({ toggleSidebar }) => {
        toggleSidebar()
      },
      i18nKey: 'shortcut.toggleSidebar',
      id: 'editor.toggleSidebar',
      keys: 'Mod+B',
      overrideMonaco: true,
    },
    {
      allowInInput: true,
      execute: ({ togglePreviewPanel }) => {
        togglePreviewPanel()
      },
      i18nKey: 'shortcut.togglePreview',
      id: 'editor.togglePreview',
      keys: 'Mod+J',
      overrideMonaco: true,
      // 同上：切换预览面板会重建运行时，抽屉会话期间同样由抽屉独占键盘挡下
    },
    {
      allowInInput: true,
      execute: ({ setLeftPanelView }) => {
        setLeftPanelView('scene')
      },
      i18nKey: 'shortcut.sidebarScene',
      id: 'editor.sidebarScene',
      keys: 'Mod+1',
      overrideMonaco: true,
    },
    {
      allowInInput: true,
      execute: ({ setLeftPanelView }) => {
        setLeftPanelView('resource')
      },
      i18nKey: 'shortcut.sidebarResource',
      id: 'editor.sidebarResource',
      keys: 'Mod+2',
      overrideMonaco: true,
    },
  ]
}
