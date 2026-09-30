import { useShortcut } from '~/features/editor/shortcut/useShortcut'

import type { TransformScaleAxis } from '~/features/editor/effect-editor/transform-flip'
import type { ShortcutDefinition, ShortcutWhen } from '~/features/editor/shortcut/types'

export interface AnimationFrameShortcutActions {
  handleAddFrame: () => void
  handleCopyFrame: () => void
  handleCutFrame: () => void
  handleDeleteFrame: () => void
  handleDuplicateFrame: () => void
  handleFlipScaleAxis: (axis: TransformScaleAxis) => void
  handleMoveFrame: (offset: -1 | 1) => void
  handlePasteFrame: () => void
  handleSelectFirstFrame: () => void
  handleSelectLastFrame: () => void
}

interface UseAnimationFrameShortcutsOptions {
  actions: AnimationFrameShortcutActions
  allowInModal?: boolean
  when: ShortcutWhen
}

/**
 * 帧级快捷键。
 *
 * 抽屉、模态框与动画可视化投影的动作完全一致，差异只有宿主自己的 when 上下文
 * （面板焦点 vs 编辑器表面）以及是否放行模态场景，所以键位与文案在这里统一定义，
 * 宿主只提供动作。撤销/重做不在此列：模态宿主没有历史体系，由各宿主自己决定。
 */
export function useAnimationFrameShortcuts(options: UseAnimationFrameShortcutsOptions): void {
  const { actions, allowInModal, when } = options
  const definitions: ShortcutDefinition[] = [
    {
      execute: actions.handleAddFrame,
      i18nKey: 'shortcut.animation.addFrame',
      id: 'animation.addFrame',
      keys: 'Mod+N',
    },
    {
      execute: actions.handleCopyFrame,
      i18nKey: 'shortcut.animation.copyFrame',
      id: 'animation.copyFrame',
      keys: 'Mod+C',
    },
    {
      execute: actions.handleCutFrame,
      i18nKey: 'shortcut.animation.cutFrame',
      id: 'animation.cutFrame',
      keys: 'Mod+X',
    },
    {
      execute: actions.handlePasteFrame,
      i18nKey: 'shortcut.animation.pasteFrame',
      id: 'animation.pasteFrame',
      keys: 'Mod+V',
    },
    {
      execute: actions.handleDuplicateFrame,
      i18nKey: 'shortcut.animation.duplicateFrame',
      id: 'animation.duplicateFrame',
      keys: 'Mod+D',
    },
    {
      execute: actions.handleDeleteFrame,
      i18nKey: 'shortcut.animation.deleteFrame',
      id: 'animation.deleteFrame',
      keys: 'Delete',
    },
    {
      execute: () => {
        actions.handleMoveFrame(-1)
      },
      i18nKey: 'shortcut.animation.moveEarlier',
      id: 'animation.moveEarlier',
      keys: 'Mod+ArrowLeft',
    },
    {
      execute: () => {
        actions.handleMoveFrame(1)
      },
      i18nKey: 'shortcut.animation.moveLater',
      id: 'animation.moveLater',
      keys: 'Mod+ArrowRight',
    },
    {
      execute: actions.handleSelectFirstFrame,
      i18nKey: 'shortcut.animation.selectFirstFrame',
      id: 'animation.selectFirstFrame',
      keys: 'Home',
    },
    {
      execute: actions.handleSelectLastFrame,
      i18nKey: 'shortcut.animation.selectLastFrame',
      id: 'animation.selectLastFrame',
      keys: 'End',
    },
    {
      execute: () => {
        actions.handleFlipScaleAxis('x')
      },
      i18nKey: 'shortcut.effect.flipHorizontal',
      id: 'animation.flipHorizontal',
      keys: 'Shift+H',
    },
    {
      execute: () => {
        actions.handleFlipScaleAxis('y')
      },
      i18nKey: 'shortcut.effect.flipVertical',
      id: 'animation.flipVertical',
      keys: 'Shift+V',
    },
  ]

  for (const definition of definitions) {
    useShortcut({
      allowInModal,
      execute: definition.execute,
      i18nKey: definition.i18nKey,
      id: definition.id,
      keys: definition.keys,
      when,
    })
  }
}
