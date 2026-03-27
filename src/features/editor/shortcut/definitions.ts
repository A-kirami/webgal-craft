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
      keys: 'Mod+Q',
      overrideMonaco: true,
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
