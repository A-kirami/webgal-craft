import { useShortcut } from '~/features/editor/shortcut/useShortcut'

import type { TransformScaleAxis } from '~/features/editor/effect-editor/transform-flip'
import type { ShortcutDefinition } from '~/features/editor/shortcut/types'

interface EffectEditorDialogShortcutActions {
  copyCurrentEffect: () => boolean
  flipScaleAxis: (axis: TransformScaleAxis) => void
  handleApply: () => void
  pasteCurrentEffect: () => boolean
}

interface EffectEditorDialogShortcutDefinition {
  action: () => void
  allowInInput?: boolean
  i18nKey: string
  id: string
  keys: ShortcutDefinition['keys']
}

/**
 * 模态框里的效果编辑器快捷键。
 *
 * 只包含直接改写草稿的操作（复制、粘贴、翻转、应用）+ 与抽屉一致的键位：
 * 撤销/重做不在此列——宿主 CommandDefaultsModal / StatementGroupModal 自身没有撤销体系，
 * 子对话框单独支持会让用户以为模态里的改动都能撤销。
 *
 * 绑定只闭包到传入的这份草稿：抽屉里同名快捷键绑定的是另一份 provider 草稿，
 * 两者靠 `panelFocus` 上下文区分，模态打开期间抽屉那批还会被 isModalOpen 拦下，互不影响。
 */
export function useEffectEditorDialogShortcuts(actions: EffectEditorDialogShortcutActions): void {
  const definitions: EffectEditorDialogShortcutDefinition[] = [
    {
      action: actions.copyCurrentEffect,
      i18nKey: 'shortcut.effect.copy',
      id: 'effectDialog.copy',
      keys: 'Mod+C',
    },
    {
      action: actions.pasteCurrentEffect,
      i18nKey: 'shortcut.effect.paste',
      id: 'effectDialog.paste',
      keys: 'Mod+V',
    },
    {
      action: () => {
        actions.flipScaleAxis('x')
      },
      i18nKey: 'shortcut.effect.flipHorizontal',
      id: 'effectDialog.flipHorizontal',
      keys: 'Shift+H',
    },
    {
      action: () => {
        actions.flipScaleAxis('y')
      },
      i18nKey: 'shortcut.effect.flipVertical',
      id: 'effectDialog.flipVertical',
      keys: 'Shift+V',
    },
    {
      action: actions.handleApply,
      allowInInput: true,
      i18nKey: 'shortcut.effect.apply',
      id: 'effectDialog.apply',
      keys: 'Mod+Enter',
    },
  ]

  for (const definition of definitions) {
    useShortcut({
      allowInInput: definition.allowInInput,
      allowInModal: true,
      execute: definition.action,
      i18nKey: definition.i18nKey,
      id: definition.id,
      keys: definition.keys,
      when: { panelFocus: 'effectEditor' },
    })
  }
}
