import { describe, expect, it } from 'vitest'

import {
  canAssetPreviewTrackMediaSession,
  resolveAssetPreviewMediaTag,
  shouldSuspendPreviousAssetPreviewMediaSession,
} from '../asset-preview'

describe('资源预览辅助函数', () => {
  it('会为音频和视频资源解析对应的媒体标签', () => {
    expect(resolveAssetPreviewMediaTag('audio/mpeg')).toBe('audio')
    expect(resolveAssetPreviewMediaTag('video/mp4')).toBe('video')
    expect(resolveAssetPreviewMediaTag('image/png')).toBeUndefined()
  })

  it('只会为可追踪媒体类型保存会话', () => {
    expect(canAssetPreviewTrackMediaSession('audio/ogg')).toBe(true)
    expect(canAssetPreviewTrackMediaSession('video/webm')).toBe(true)
    expect(canAssetPreviewTrackMediaSession('text/plain')).toBe(false)
  })

  it('只会在上一个资源是可追踪媒体且资源发生切换时暂停旧会话', () => {
    expect(shouldSuspendPreviousAssetPreviewMediaSession({
      nextMimeType: 'audio/mpeg',
      nextPath: '/game/beta.mp3',
      previousMimeType: 'audio/mpeg',
      previousPath: '/game/alpha.mp3',
    })).toBe(true)

    expect(shouldSuspendPreviousAssetPreviewMediaSession({
      nextMimeType: 'video/mp4',
      nextPath: '/game/video.mp4',
      previousMimeType: 'image/png',
      previousPath: '/game/cover.png',
    })).toBe(false)

    expect(shouldSuspendPreviousAssetPreviewMediaSession({
      nextMimeType: 'audio/mpeg',
      nextPath: '/game/alpha.mp3',
      previousMimeType: 'audio/mpeg',
      previousPath: '/game/alpha.mp3',
    })).toBe(false)

    expect(shouldSuspendPreviousAssetPreviewMediaSession({
      nextMimeType: 'audio/mpeg',
      nextPath: '/game/alpha.mp3',
      previousMimeType: undefined,
      previousPath: undefined,
    })).toBe(false)
  })
})
