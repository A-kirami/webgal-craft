import { normalizeShortcutBindingKey } from './keys'

import type { ShortcutPlatform } from './types'

export interface ShortcutGuideEntry {
  /**
   * 每个备选键位拆成待展示的按键片段，例如 Ctrl / Shift / Z。
   * 多个备选之间是「或」的关系。鼠标手势条目为空数组。
   */
  chords: string[][]
  /** 鼠标手势的本地化文案；设置时忽略 chords。 */
  gesture?: string
  label: string
}

export interface ShortcutGuideGroup {
  entries: ShortcutGuideEntry[]
  id: string
  title: string
}

type ShortcutTranslate = (key: string) => string

const MAC_MODIFIER_SYMBOLS: Record<string, string> = {
  Alt: '⌥',
  Ctrl: '⌃',
  Meta: '⌘',
  Shift: '⇧',
}

const KEY_SYMBOLS: Record<string, string> = {
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  Delete: 'Del',
  Escape: 'Esc',
}

function resolveModifierLabel(token: string, platform: ShortcutPlatform): string | undefined {
  if (platform === 'mac') {
    return MAC_MODIFIER_SYMBOLS[token]
  }

  if (token === 'Meta') {
    return platform === 'windows' ? 'Win' : 'Super'
  }

  return undefined
}

/** 把 'Mod+Shift+Z' 这类绑定键格式化为平台相关的按键片段。 */
export function formatShortcutChord(key: string, platform: ShortcutPlatform): string[] {
  const normalized = normalizeShortcutBindingKey(key, platform)
  if (!normalized) {
    return []
  }

  return normalized
    .split('+')
    .map(token => resolveModifierLabel(token, platform) ?? KEY_SYMBOLS[token] ?? token)
}

function formatModifier(modifier: 'Alt' | 'Mod' | 'Shift', platform: ShortcutPlatform): string {
  if (modifier === 'Mod') {
    const token = platform === 'mac' ? 'Meta' : 'Ctrl'
    return resolveModifierLabel(token, platform) ?? token
  }

  return resolveModifierLabel(modifier, platform) ?? modifier
}

/**
 * 设置-帮助里展示的快捷键指南。
 *
 * 分组按生效的场景划分而不是按输入设备划分：同一个场景里的键盘快捷键和鼠标手势放在一起，
 * 鼠标手势跟着它真正生效的面板走。
 *
 * 这里刻意是静态清单而不是从快捷键注册表推导：注册表按面板焦点动态挂载，
 * 设置弹窗在编辑器之外，拿不到完整绑定；而且指南面向用户，需要覆盖 Monaco
 * 内建键、鼠标手势、变换微调等不走 useShortcut 的交互。
 */
export function createShortcutGuide(
  t: ShortcutTranslate,
  platform: ShortcutPlatform,
): ShortcutGuideGroup[] {
  function entry(label: string, keys: string | string[]): ShortcutGuideEntry {
    return {
      chords: (Array.isArray(keys) ? keys : [keys])
        .map(key => formatShortcutChord(key, platform))
        .filter(chord => chord.length > 0),
      label,
    }
  }

  function gestureEntry(label: string, gesture: string): ShortcutGuideEntry {
    return {
      chords: [],
      gesture,
      label,
    }
  }

  // macOS 上 ⌘Y 不是标准重做键，指南只在 Windows/Linux 展示 Ctrl+Y
  const redoKeys: string | string[] = platform === 'mac'
    ? 'Mod+Shift+Z'
    : ['Mod+Shift+Z', 'Mod+Y']

  return [
    {
      entries: [
        entry(t('shortcut.save'), 'Mod+S'),
        entry(t('shortcut.commandPanel'), 'Mod+P'),
        entry(t('shortcut.toggleSidebar'), 'Mod+B'),
        entry(t('shortcut.togglePreview'), 'Mod+Q'),
        entry(t('shortcut.sidebarScene'), 'Mod+1'),
        entry(t('shortcut.sidebarResource'), 'Mod+2'),
        gestureEntry(t('shortcut.scrub.adjust'), t('shortcut.mouse.dragLabel')),
        gestureEntry(t('shortcut.scrub.coarse'), `${formatModifier('Shift', platform)} + ${t('shortcut.mouse.dragLabel')}`),
        gestureEntry(t('shortcut.scrub.fine'), `${formatModifier('Alt', platform)} + ${t('shortcut.mouse.dragLabel')}`),
      ],
      id: 'general',
      title: t('shortcut.groups.general'),
    },
    {
      entries: [
        entry(t('shortcut.visual.undo'), 'Mod+Z'),
        entry(t('shortcut.visual.redo'), redoKeys),
        entry(t('shortcut.textEditor.find'), 'Mod+F'),
        entry(t('shortcut.textEditor.replace'), platform === 'mac' ? 'Mod+Alt+F' : 'Mod+H'),
      ],
      id: 'textEditor',
      title: t('shortcut.groups.textEditor'),
    },
    {
      entries: [
        entry(t('shortcut.visual.undo'), 'Mod+Z'),
        entry(t('shortcut.visual.redo'), redoKeys),
        entry(t('shortcut.visual.copy'), 'Mod+C'),
        entry(t('shortcut.visual.cut'), 'Mod+X'),
        entry(t('shortcut.visual.paste'), 'Mod+V'),
        entry(t('shortcut.visual.duplicate'), 'Mod+D'),
        entry(t('shortcut.visual.delete'), 'Delete'),
        entry(t('shortcut.visual.moveUp'), 'Mod+ArrowUp'),
        entry(t('shortcut.visual.moveDown'), 'Mod+ArrowDown'),
        entry(t('shortcut.visual.selectFirst'), 'Home'),
        entry(t('shortcut.visual.selectLast'), 'End'),
      ],
      id: 'visualEditor',
      title: t('shortcut.groups.visualEditor'),
    },
    {
      entries: [
        entry(t('shortcut.effect.undo'), 'Mod+Z'),
        entry(t('shortcut.effect.redo'), redoKeys),
        entry(t('shortcut.effect.copy'), 'Mod+C'),
        entry(t('shortcut.effect.paste'), 'Mod+V'),
        entry(t('shortcut.effect.flipHorizontal'), 'Shift+H'),
        entry(t('shortcut.effect.flipVertical'), 'Shift+V'),
        entry(t('shortcut.effect.apply'), 'Mod+Enter'),
        entry(t('shortcut.effect.close'), 'Escape'),
      ],
      id: 'effectEditor',
      title: t('shortcut.groups.effectEditor'),
    },
    {
      entries: [
        entry(t('shortcut.visual.undo'), 'Mod+Z'),
        entry(t('shortcut.visual.redo'), redoKeys),
        entry(t('shortcut.animation.deleteFrame'), 'Delete'),
        entry(t('shortcut.animation.apply'), 'Mod+Enter'),
        entry(t('shortcut.animation.close'), 'Escape'),
        gestureEntry(t('shortcut.mouse.zoomTimeline'), `${formatModifier('Mod', platform)} + ${t('shortcut.mouse.wheel')}`),
      ],
      id: 'animationEditor',
      title: t('shortcut.groups.animationEditor'),
    },
    {
      entries: [
        gestureEntry(t('shortcut.mouse.panCanvas'), t('shortcut.mouse.middleDrag')),
        gestureEntry(t('shortcut.mouse.panCanvas'), t('shortcut.mouse.spaceDrag')),
        gestureEntry(t('shortcut.mouse.zoomCanvas'), `${formatModifier('Mod', platform)} + ${t('shortcut.mouse.wheel')}`),
      ],
      id: 'preview',
      title: t('shortcut.groups.preview'),
    },
    {
      entries: [
        entry(t('shortcut.effect.undo'), 'Mod+Z'),
        entry(t('shortcut.effect.redo'), redoKeys),
        entry(t('shortcut.effect.flipHorizontal'), 'Shift+H'),
        entry(t('shortcut.effect.flipVertical'), 'Shift+V'),
        entry(t('shortcut.effect.apply'), ['Enter', 'Mod+Enter']),
        entry(t('shortcut.effect.close'), 'Escape'),
        gestureEntry(t('shortcut.mouse.moveElement'), t('shortcut.mouse.drag')),
        gestureEntry(t('shortcut.mouse.scaleElement'), t('shortcut.mouse.handleDrag')),
        gestureEntry(t('shortcut.mouse.rotateElement'), t('shortcut.mouse.rotateDrag')),
        gestureEntry(t('shortcut.mouse.lockAxis'), `${formatModifier('Shift', platform)} + ${t('shortcut.mouse.drag')}`),
        gestureEntry(
          t('shortcut.mouse.toggleUniformScale'),
          `${formatModifier('Shift', platform)} + ${t('shortcut.mouse.handleDrag')}`,
        ),
        gestureEntry(t('shortcut.mouse.rotateSnap'), `${formatModifier('Shift', platform)} + ${t('shortcut.mouse.rotateDrag')}`),
        entry(t('shortcut.transform.nudge'), ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']),
        entry(
          t('shortcut.transform.nudgeFast'),
          ['Shift+ArrowUp', 'Shift+ArrowDown', 'Shift+ArrowLeft', 'Shift+ArrowRight'],
        ),
      ],
      id: 'transform',
      title: t('shortcut.groups.transform'),
    },
    {
      entries: [
        entry(t('shortcut.fileTree.rename'), 'F2'),
        entry(t('shortcut.fileTree.delete'), 'Delete'),
      ],
      id: 'fileTree',
      title: t('shortcut.groups.fileTree'),
    },
  ]
}
