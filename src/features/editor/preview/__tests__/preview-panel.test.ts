import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PREVIEW_PANEL_ASPECT_RATIO,
  resolvePreviewPanelStageSize,
} from '../preview-panel'

describe('预览面板辅助函数', () => {
  it('没有请求路径时会回退到默认舞台尺寸', () => {
    expect(resolvePreviewPanelStageSize({
      currentGamePath: undefined,
      requestedPath: undefined,
    })).toEqual({
      aspectRatio: DEFAULT_PREVIEW_PANEL_ASPECT_RATIO,
      stageHeight: 1440,
      stageWidth: 2560,
    })
  })

  it('会解析配置宽高并在非法值时使用默认尺寸', () => {
    expect(resolvePreviewPanelStageSize({
      currentGamePath: '/games/demo',
      gameConfig: {
        stageHeight: '720',
        stageWidth: '1280',
      },
      requestedPath: '/games/demo',
    })).toEqual({
      aspectRatio: '1280/720',
      stageHeight: 720,
      stageWidth: 1280,
    })

    expect(resolvePreviewPanelStageSize({
      currentGamePath: '/games/demo',
      gameConfig: {
        stageHeight: '',
        stageWidth: 'invalid',
      },
      requestedPath: '/games/demo',
    })).toEqual({
      aspectRatio: DEFAULT_PREVIEW_PANEL_ASPECT_RATIO,
      stageHeight: 1440,
      stageWidth: 2560,
    })
  })

  it('当前游戏已切换时会丢弃过期请求结果', () => {
    expect(resolvePreviewPanelStageSize({
      currentGamePath: '/games/next',
      gameConfig: {
        stageHeight: 720,
        stageWidth: 1280,
      },
      requestedPath: '/games/demo',
    })).toBeUndefined()
  })
})
