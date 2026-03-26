import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import {
  normalizeStatementPanelSingleLineValue,
  resolveStatementPanelPreviewImageUrl,
} from '~/features/editor/statement-editor/panel'

import type { EditorField } from '~/features/editor/command-registry/schema'

function createFileContentField(assetType: string): EditorField {
  return {
    key: 'content',
    storage: 'content',
    field: {
      key: 'content',
      label: 'file',
      type: 'file',
      fileConfig: {
        assetType,
        extensions: ['.png'],
        title: 'file',
      },
    },
  }
}

describe('语句编辑面板辅助函数', () => {
  it('会把多行输入归一化为单行文本', () => {
    expect(normalizeStatementPanelSingleLineValue('line1\nline2\r\nline3')).toBe('line1 line2 line3')
  })

  it('会为支持图片预览的命令解析资源 URL', () => {
    expect(resolveStatementPanelPreviewImageUrl({
      command: commandType.changeBg,
      content: 'bg/scene-1.png',
      contentField: createFileContentField('background'),
      cwd: '/games/demo',
      fileRootPaths: {
        background: '/games/demo/assets/background',
      },
      previewBaseUrl: 'http://127.0.0.1:8899/',
      showSidebarAssetPreview: true,
    })).toBe('http://127.0.0.1:8899/assets/background/bg/scene-1.png')
  })

  it('会忽略不支持的命令、被排除的扩展名和缺失上下文', () => {
    expect(resolveStatementPanelPreviewImageUrl({
      command: commandType.video,
      content: 'opening.mp4',
      contentField: createFileContentField('video'),
      cwd: '/games/demo',
      fileRootPaths: {
        video: '/games/demo/assets/video',
      },
      previewBaseUrl: 'http://127.0.0.1:8899/',
      showSidebarAssetPreview: true,
    })).toBe('')

    expect(resolveStatementPanelPreviewImageUrl({
      command: commandType.changeFigure,
      content: 'figure/model.json',
      contentField: createFileContentField('figure'),
      cwd: '/games/demo',
      fileRootPaths: {
        figure: '/games/demo/assets/figure',
      },
      previewBaseUrl: 'http://127.0.0.1:8899/',
      showSidebarAssetPreview: true,
    })).toBe('')

    expect(resolveStatementPanelPreviewImageUrl({
      command: commandType.changeFigure,
      content: 'hero.png',
      contentField: createFileContentField('figure'),
      cwd: undefined,
      fileRootPaths: {
        figure: '/games/demo/assets/figure',
      },
      previewBaseUrl: 'http://127.0.0.1:8899/',
      showSidebarAssetPreview: true,
    })).toBe('')
  })
})
