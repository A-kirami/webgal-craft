import { describe, expect, it } from 'vitest'

import { AbsPath } from '~/domain/path'
import {
  resolveVisualEditorDropAction,
} from '~/features/editor/visual-editor/visual-editor-file-drop'

import type { FileSystemDragPayload } from '~/types/drag-drop'

function createPayload(path: string): FileSystemDragPayload {
  return {
    source: 'file-viewer',
    type: 'file-system-item',
    path,
    isDir: false,
    name: path.split('/').at(-1),
  }
}

describe('visual-editor-file-drop', () => {
  it('scene 投放到 choose 更新区时会追加选项文件', () => {
    const action = resolveVisualEditorDropAction({
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/scene/chapter2.txt'),
      placement: 'update',
      rawText: 'choose::a.txt;',
      insertIndex: 3,
      statementId: 12,
    })

    expect(action).toMatchObject({
      kind: 'update-statement',
      statementId: 12,
      rawText: 'choose::a.txt|:chapter2.txt;',
    })
  })

  it('background 投放到 gap 区时会返回 changeBg 插入动作', () => {
    const action = resolveVisualEditorDropAction({
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/background/room.png'),
      placement: 'gap',
      insertIndex: 2,
    })

    expect(action).toMatchObject({
      kind: 'insert-statements',
      insertIndex: 2,
      rawTexts: ['changeBg:room.png;'],
    })
  })

  it('background 投放到 head 区时会返回列表头部插入动作', () => {
    const action = resolveVisualEditorDropAction({
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/background/room.png'),
      placement: 'head',
      insertIndex: 0,
    })

    expect(action).toMatchObject({
      kind: 'insert-statements',
      insertIndex: 0,
      rawTexts: ['changeBg:room.png;'],
    })
  })

  it('tail 区投放会在最后一条语句后插入', () => {
    const action = resolveVisualEditorDropAction({
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/scene/finale.txt'),
      placement: 'tail',
      insertIndex: 5,
    })

    expect(action).toMatchObject({
      kind: 'insert-statements',
      insertIndex: 5,
      rawTexts: ['changeScene:finale.txt;'],
    })
  })

  it('不兼容的 update 目标会返回 undefined', () => {
    const action = resolveVisualEditorDropAction({
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/bgm/theme.ogg'),
      placement: 'update',
      rawText: 'changeBg:room.png;',
      insertIndex: 1,
      statementId: 1,
    })

    expect(action).toBeUndefined()
  })

  it('非 txt scene 资源会被拒绝', () => {
    const action = resolveVisualEditorDropAction({
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/scene/chapter2.json'),
      placement: 'gap',
      insertIndex: 0,
    })

    expect(action).toBeUndefined()
  })
})
