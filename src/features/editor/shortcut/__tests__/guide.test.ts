import { describe, expect, it } from 'vitest'

import { createShortcutGuide, formatShortcutChord } from '../guide'

describe('formatShortcutChord', () => {
  it('Windows 下把 Mod 展开为 Ctrl', () => {
    expect(formatShortcutChord('Mod+S', 'windows')).toEqual(['Ctrl', 'S'])
    expect(formatShortcutChord('Mod+Shift+Z', 'windows')).toEqual(['Ctrl', 'Shift', 'Z'])
  })

  it('macOS 下把修饰键渲染为符号', () => {
    expect(formatShortcutChord('Mod+S', 'mac')).toEqual(['⌘', 'S'])
    expect(formatShortcutChord('Mod+Shift+Z', 'mac')).toEqual(['⌘', '⇧', 'Z'])
  })

  it('把方向键和 Escape 换成紧凑展示', () => {
    expect(formatShortcutChord('Mod+ArrowUp', 'windows')).toEqual(['Ctrl', '↑'])
    expect(formatShortcutChord('Escape', 'windows')).toEqual(['Esc'])
  })

  it('缺少主键的绑定返回空数组', () => {
    expect(formatShortcutChord('Ctrl+Shift', 'windows')).toEqual([])
  })
})

describe('createShortcutGuide', () => {
  const guide = createShortcutGuide(key => key, 'windows')

  it('按使用场景分组用户可发现的快捷键', () => {
    expect(guide.map(group => group.id)).toEqual([
      'general',
      'textEditor',
      'visualEditor',
      'effectEditor',
      'animationEditor',
      'preview',
      'transform',
      'fileTree',
    ])
  })

  it('每条快捷键都有文案和可展示的输入方式', () => {
    for (const group of guide) {
      expect(group.title).not.toBe('')
      expect(group.entries.length).toBeGreaterThan(0)

      for (const entry of group.entries) {
        expect(entry.label).not.toBe('')

        if (entry.gesture) {
          expect(entry.gesture).not.toBe('')
          continue
        }

        expect(entry.chords.length).toBeGreaterThan(0)

        for (const chord of entry.chords) {
          expect(chord.length).toBeGreaterThan(0)
        }
      }
    }
  })

  it('鼠标手势跟随生效场景，并按平台渲染修饰键', () => {
    const gesturesOf = (groupId: string, platform: 'windows' | 'mac') =>
      createShortcutGuide(key => key, platform)
        .find(group => group.id === groupId)
        ?.entries.map(entry => entry.gesture)

    expect(gesturesOf('preview', 'windows')).toContain('Ctrl + shortcut.mouse.wheel')
    expect(gesturesOf('preview', 'mac')).toContain('\u2318 + shortcut.mouse.wheel')
    expect(gesturesOf('transform', 'mac')).toContain('\u21E7 + shortcut.mouse.drag')
    expect(gesturesOf('animationEditor', 'windows')).toContain('Ctrl + shortcut.mouse.wheel')
  })

  it('可视化编辑器与动画编辑器分别标注删除对象', () => {
    const labelsOf = (groupId: string) =>
      createShortcutGuide(key => key, 'windows')
        .find(group => group.id === groupId)
        ?.entries.map(entry => entry.label)

    expect(labelsOf('visualEditor')).toContain('shortcut.visual.delete')
    expect(labelsOf('animationEditor')).toContain('shortcut.animation.deleteFrame')
  })

  it('变换调整与效果编辑器共用同一应用文案键且只保留组合回车', () => {
    const applyEntry = createShortcutGuide(key => key, 'windows')
      .find(group => group.id === 'transform')
      ?.entries.find(entry => entry.label === 'shortcut.effect.apply')

    expect(applyEntry?.chords).toEqual([['Ctrl', 'Enter']])
  })

  it('标签拖拽 scrub 跨编辑器只在通用分组列出一次', () => {
    const groupsWithScrub = createShortcutGuide(key => key, 'windows')
      .filter(group => group.entries.some(entry => entry.label === 'shortcut.scrub.adjust'))

    expect(groupsWithScrub.map(group => group.id)).toEqual(['general'])
  })

  it('变换调整同时提供效果编辑器命令与元素操作手势', () => {
    const labels = createShortcutGuide(key => key, 'windows')
      .find(group => group.id === 'transform')
      ?.entries.map(entry => entry.label)

    expect(labels).toEqual(expect.arrayContaining([
      'shortcut.effect.undo',
      'shortcut.effect.redo',
      'shortcut.effect.flipHorizontal',
      'shortcut.effect.flipVertical',
      'shortcut.effect.close',
      'shortcut.mouse.moveElement',
      'shortcut.mouse.scaleElement',
      'shortcut.mouse.rotateElement',
    ]))
  })

  it('macOS 下文本编辑器替换使用 ⌘⌥F', () => {
    const macGuide = createShortcutGuide(key => key, 'mac')
    const replaceEntry = macGuide
      .find(group => group.id === 'textEditor')
      ?.entries.find(entry => entry.label === 'shortcut.textEditor.replace')

    expect(replaceEntry?.chords).toEqual([['⌘', '⌥', 'F']])
  })

  it('重做的 Ctrl+Y 备选只在 Windows/Linux 展示', () => {
    const chordsOf = (platform: 'windows' | 'mac') =>
      createShortcutGuide(key => key, platform)
        .find(group => group.id === 'textEditor')
        ?.entries.find(entry => entry.label === 'shortcut.visual.redo')
        ?.chords

    expect(chordsOf('windows')).toEqual([['Ctrl', 'Shift', 'Z'], ['Ctrl', 'Y']])
    expect(chordsOf('mac')).toEqual([['⌘', '⇧', 'Z']])
  })
})
