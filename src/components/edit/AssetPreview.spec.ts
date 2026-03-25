import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

import AssetPreview from './AssetPreview.vue'

import type { AssetPreviewState } from '~/stores/editor'

const {
  getPreviewMediaSessionMock,
  updatePreviewMediaSessionMock,
  useEditorStoreMock,
} = vi.hoisted(() => ({
  getPreviewMediaSessionMock: vi.fn(),
  updatePreviewMediaSessionMock: vi.fn(),
  useEditorStoreMock: vi.fn(),
}))

vi.mock('~/stores/editor', () => ({
  useEditorStore: useEditorStoreMock,
}))

interface MockMediaState {
  currentTime: number
  paused: boolean
  playbackRate: number
  volume: number
  muted: boolean
}

function createPreviewState(path: string): AssetPreviewState {
  return {
    path,
    view: 'preview',
    assetUrl: `file://${path}`,
    mimeType: 'audio/mpeg',
  }
}

function setMediaProperty<TKey extends keyof MockMediaState>(
  element: HTMLMediaElement,
  key: TKey,
  value: MockMediaState[TKey],
) {
  Object.defineProperty(element, key, {
    configurable: true,
    value,
    writable: true,
  })
}

function applyMediaState(element: HTMLMediaElement, state: MockMediaState) {
  setMediaProperty(element, 'currentTime', state.currentTime)
  setMediaProperty(element, 'paused', state.paused)
  setMediaProperty(element, 'playbackRate', state.playbackRate)
  setMediaProperty(element, 'volume', state.volume)
  setMediaProperty(element, 'muted', state.muted)
}

describe('AssetPreview', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    getPreviewMediaSessionMock.mockReset()
    updatePreviewMediaSessionMock.mockReset()
    useEditorStoreMock.mockReset()
    useEditorStoreMock.mockReturnValue({
      getPreviewMediaSession: getPreviewMediaSessionMock,
      updatePreviewMediaSession: updatePreviewMediaSessionMock,
    })
  })

  it('切换预览文件时会将旧媒体会话保存为暂停态', async () => {
    const result = await render(AssetPreview, {
      props: {
        state: createPreviewState('/game/alpha.mp3'),
      },
    })

    const mediaLocator = page.getByTestId('asset-preview-media')
    await expect.element(mediaLocator).toBeInTheDocument()

    applyMediaState(mediaLocator.element() as HTMLMediaElement, {
      currentTime: 12.5,
      paused: false,
      playbackRate: 1.25,
      volume: 0.4,
      muted: true,
    })

    await result.rerender({
      state: createPreviewState('/game/beta.mp3'),
    })

    expect(updatePreviewMediaSessionMock).toHaveBeenNthCalledWith(1, '/game/alpha.mp3', {
      currentTime: 12.5,
      paused: true,
      playbackRate: 1.25,
      volume: 0.4,
      muted: true,
    })

    await result.unmount()
  })

  it('卸载时会将当前媒体会话保存为暂停态', async () => {
    const result = await render(AssetPreview, {
      props: {
        state: createPreviewState('/game/finale.mp3'),
      },
    })

    const mediaLocator = page.getByTestId('asset-preview-media')
    await expect.element(mediaLocator).toBeInTheDocument()

    applyMediaState(mediaLocator.element() as HTMLMediaElement, {
      currentTime: 7.25,
      paused: false,
      playbackRate: 1,
      volume: 0.8,
      muted: false,
    })

    await result.unmount()

    expect(updatePreviewMediaSessionMock).toHaveBeenCalledOnce()
    expect(updatePreviewMediaSessionMock).toHaveBeenCalledWith('/game/finale.mp3', {
      currentTime: 7.25,
      paused: true,
      playbackRate: 1,
      volume: 0.8,
      muted: false,
    })
  })
})
