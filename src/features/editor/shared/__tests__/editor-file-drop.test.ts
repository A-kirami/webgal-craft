import { describe, expect, it } from 'vitest'

import { AbsPath } from '~/domain/path'
import {
  buildInsertedStatementText,
  resolveEditorDropAsset,
  updateStatementTextForDroppedAsset,
} from '~/features/editor/shared/editor-file-drop'

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

function createSingleItemPayload(path: string): FileSystemDragPayload {
  return {
    ...createPayload(path),
    items: [{
      isDir: false,
      name: path.split('/').at(-1),
      path,
    }],
  }
}

describe('editor-file-drop', () => {
  it('background 资源会被识别为脚本字段路径', () => {
    const asset = resolveEditorDropAsset({
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/background/room.png'),
    })

    expect(asset).toMatchObject({
      assetType: 'background',
      scriptPath: 'room.png',
    })
  })

  it('真实单文件拖拽 payload 带单项 items 时仍会识别资源', () => {
    const asset = resolveEditorDropAsset({
      gamePath: AbsPath.from('/games/demo'),
      payload: createSingleItemPayload('/games/demo/game/background/room.png'),
    })

    expect(asset).toMatchObject({
      assetType: 'background',
      scriptPath: 'room.png',
    })
  })

  it('animationTable.json 会被拒绝', () => {
    const asset = resolveEditorDropAsset({
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/animation/animationTable.json'),
    })

    expect(asset).toBeUndefined()
  })

  it('animation 资源写入脚本字段时只去掉 .json 后缀', () => {
    const asset = resolveEditorDropAsset({
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/animation/fade/in.json'),
    })!

    expect(asset).toMatchObject({
      assetType: 'animation',
      scriptPath: 'fade/in',
    })
    expect(buildInsertedStatementText(asset)).toBe('setAnimation:fade/in;')
    expect(updateStatementTextForDroppedAsset('setAnimation:old;', asset)).toBe('setAnimation:fade/in;')
  })

  it('animation 非 json 文件会被拒绝', () => {
    const asset = resolveEditorDropAsset({
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/animation/fade/in.png'),
    })

    expect(asset).toBeUndefined()
  })

  it('game 根外资源会被拒绝而不是抛出异常', () => {
    expect(() => resolveEditorDropAsset({
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/downloads/room.png'),
    })).not.toThrow()

    expect(resolveEditorDropAsset({
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/downloads/room.png'),
    })).toBeUndefined()
  })

  it('scene 非 txt 会被拒绝', () => {
    const asset = resolveEditorDropAsset({
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/scene/chapter2.json'),
    })

    expect(asset).toBeUndefined()
  })

  it('video 资源会生成 playVideo 语句', () => {
    const asset = resolveEditorDropAsset({
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/video/opening.webm'),
    })!

    expect(buildInsertedStatementText(asset)).toBe('playVideo:opening.webm;')
  })

  it('say 行投放 vocal 会更新 vocal 参数', () => {
    const asset = resolveEditorDropAsset({
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/vocal/line-1.ogg'),
    })!

    const nextRawText = updateStatementTextForDroppedAsset('say:你好 -speaker=Alice;', asset)
    expect(nextRawText).toBe('say:你好 -speaker=Alice -line-1.ogg;')
  })

  it('choose 行投放 scene 会追加 file 而不是覆盖 content', () => {
    const asset = resolveEditorDropAsset({
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/scene/chapter2.txt'),
    })!

    const nextRawText = updateStatementTextForDroppedAsset('choose::a.txt;', asset)
    expect(nextRawText).toBe('choose::a.txt|:chapter2.txt;')
  })

  it('choose 行投放 scene 会优先补全末尾空 file 选项', () => {
    const asset = resolveEditorDropAsset({
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/scene/good.txt'),
    })!

    const nextRawText = updateStatementTextForDroppedAsset('choose:拒绝:bad.txt|同意:;', asset)
    expect(nextRawText).toBe('choose:拒绝:bad.txt|同意:good.txt;')
  })

  it('choose 行只有中间选项 file 为空时仍追加 scene', () => {
    const asset = resolveEditorDropAsset({
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/scene/good.txt'),
    })!

    const nextRawText = updateStatementTextForDroppedAsset('choose:同意:|拒绝:bad.txt;', asset)
    expect(nextRawText).toBe('choose:同意:|拒绝:bad.txt|:good.txt;')
  })

  it('非兼容语句返回 undefined，供上层显示禁止态或走路径插入', () => {
    const asset = resolveEditorDropAsset({
      gamePath: AbsPath.from('/games/demo'),
      payload: createPayload('/games/demo/game/bgm/theme.ogg'),
    })!

    expect(updateStatementTextForDroppedAsset('changeBg:room.png;', asset)).toBeUndefined()
  })
})
