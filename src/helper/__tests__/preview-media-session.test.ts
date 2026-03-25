import { describe, expect, it } from 'vitest'

import {
  createPreviewMediaSession,
  normalizePreviewMediaSessionPatch,
  restorePreviewMediaSession,
  snapshotPreviewMediaSession,
} from '../preview-media-session'

describe('预览媒体会话', () => {
  it('创建默认的媒体预览会话状态', () => {
    expect(createPreviewMediaSession()).toEqual({
      currentTime: 0,
      paused: true,
      playbackRate: 1,
      volume: 1,
      muted: false,
    })
  })

  it('规范化媒体预览会话补丁', () => {
    expect(normalizePreviewMediaSessionPatch({
      currentTime: -5,
      paused: false,
      playbackRate: 0,
      volume: 2,
      muted: true,
    })).toEqual({
      currentTime: 0,
      paused: false,
      volume: 1,
      muted: true,
    })
  })

  it('创建会话时合并并规范化初始值', () => {
    expect(createPreviewMediaSession({
      currentTime: 12.5,
      paused: false,
      playbackRate: 1.25,
      volume: -1,
    })).toEqual({
      currentTime: 12.5,
      paused: false,
      playbackRate: 1.25,
      volume: 0,
      muted: false,
    })
  })

  it('从媒体元素快照会话时可以覆盖暂停状态并规范化值', () => {
    expect(snapshotPreviewMediaSession({
      currentTime: -5,
      paused: false,
      playbackRate: 0,
      volume: 2,
      muted: true,
    }, {
      paused: true,
    })).toEqual({
      currentTime: 0,
      paused: true,
      playbackRate: 1,
      volume: 1,
      muted: true,
    })
  })

  it('恢复会话时会把时间限制在媒体时长内，并返回是否继续播放', () => {
    const mediaTarget = {
      currentTime: 0,
      playbackRate: 1,
      volume: 1,
      muted: false,
      duration: 10,
    }

    expect(restorePreviewMediaSession(mediaTarget, {
      currentTime: 12.5,
      paused: false,
      playbackRate: 1.25,
      volume: 0.4,
      muted: true,
    })).toEqual({
      shouldResumePlayback: true,
    })

    expect(mediaTarget).toEqual({
      currentTime: 10,
      playbackRate: 1.25,
      volume: 0.4,
      muted: true,
      duration: 10,
    })
  })
})
