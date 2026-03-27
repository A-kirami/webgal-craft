import { describe, expect, it } from 'vitest'

import {
  normalizeStatementPanelSingleLineValue,
  resolveStatementPanelPreviewMedia,
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

  it('会为可识别的图片、视频和音频内容解析预览媒体', () => {
    expect(resolveStatementPanelPreviewMedia({
      content: 'bg/scene-1.png',
      contentField: createFileContentField('background'),
      cwd: '/games/demo',
      fileRootPaths: {
        background: '/games/demo/assets/background',
      },
      previewBaseUrl: 'http://127.0.0.1:8899/',
      showSidebarAssetPreview: true,
    })).toEqual({
      mimeType: 'image/png',
      url: 'http://127.0.0.1:8899/assets/background/bg/scene-1.png',
    })

    expect(resolveStatementPanelPreviewMedia({
      content: 'opening/movie.webm',
      contentField: createFileContentField('video'),
      cwd: '/games/demo',
      fileRootPaths: {
        video: '/games/demo/assets/video',
      },
      previewBaseUrl: 'http://127.0.0.1:8899/',
      showSidebarAssetPreview: true,
    })).toEqual({
      mimeType: 'video/webm',
      url: 'http://127.0.0.1:8899/assets/video/opening/movie.webm',
    })

    expect(resolveStatementPanelPreviewMedia({
      content: 'bgm/theme.ogg',
      contentField: createFileContentField('bgm'),
      cwd: '/games/demo',
      fileRootPaths: {
        bgm: '/games/demo/assets/bgm',
      },
      previewBaseUrl: 'http://127.0.0.1:8899/',
      showSidebarAssetPreview: true,
    })).toEqual({
      mimeType: 'audio/ogg',
      url: 'http://127.0.0.1:8899/assets/bgm/bgm/theme.ogg',
    })
  })

  it('会忽略非媒体内容、关闭预览和缺失上下文', () => {
    expect(resolveStatementPanelPreviewMedia({
      content: 'figure/model.json',
      contentField: createFileContentField('figure'),
      cwd: '/games/demo',
      fileRootPaths: {
        figure: '/games/demo/assets/figure',
      },
      previewBaseUrl: 'http://127.0.0.1:8899/',
      showSidebarAssetPreview: true,
    })).toBeUndefined()

    expect(resolveStatementPanelPreviewMedia({
      content: 'spine/model.skel',
      contentField: createFileContentField('figure'),
      cwd: '/games/demo',
      fileRootPaths: {
        figure: '/games/demo/assets/figure',
      },
      previewBaseUrl: 'http://127.0.0.1:8899/',
      showSidebarAssetPreview: true,
    })).toBeUndefined()

    expect(resolveStatementPanelPreviewMedia({
      content: 'plain-text-without-extension',
      contentField: createFileContentField('scene'),
      cwd: '/games/demo',
      fileRootPaths: {
        scene: '/games/demo/assets/scene',
      },
      previewBaseUrl: 'http://127.0.0.1:8899/',
      showSidebarAssetPreview: true,
    })).toBeUndefined()

    expect(resolveStatementPanelPreviewMedia({
      content: 'voice.wav',
      contentField: createFileContentField('vocal'),
      cwd: '/games/demo',
      fileRootPaths: {
        vocal: '/games/demo/assets/vocal',
      },
      previewBaseUrl: 'http://127.0.0.1:8899/',
      showSidebarAssetPreview: false,
    })).toBeUndefined()

    expect(resolveStatementPanelPreviewMedia({
      content: 'hero.png',
      contentField: createFileContentField('figure'),
      cwd: undefined,
      fileRootPaths: {
        figure: '/games/demo/assets/figure',
      },
      previewBaseUrl: 'http://127.0.0.1:8899/',
      showSidebarAssetPreview: true,
    })).toBeUndefined()
  })
})
