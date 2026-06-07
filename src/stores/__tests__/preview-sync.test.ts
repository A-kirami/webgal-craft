import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePreviewSyncStore } from '../preview-sync'

const {
  sendPreviewCommandMock,
} = vi.hoisted(() => ({
  sendPreviewCommandMock: vi.fn(),
}))

vi.mock('~/commands/server', () => ({
  serverCmds: {
    sendPreviewCommand: sendPreviewCommandMock,
  },
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  debug: vi.fn(),
  warn: vi.fn(),
}))

describe('previewSyncStore 预览同步状态仓库', () => {
  beforeEach(() => {
    sendPreviewCommandMock.mockReset()
  })

  it('消费宿主事件后会更新就绪状态与舞台快照', () => {
    const store = usePreviewSyncStore()

    store.consumeHostEvent(JSON.stringify({
      kind: 'event',
      type: 'preview.ready.updated',
      payload: {
        ready: true,
      },
    }))
    store.consumeHostEvent(JSON.stringify({
      kind: 'event',
      type: 'stage.snapshot.updated',
      payload: {
        sceneName: 'start.txt',
        sentenceId: 3,
        stageState: {
          showTitle: false,
        },
      },
    }))

    expect(store.isPreviewReady).toBe(true)
    expect(store.stageSnapshot).toEqual({
      sceneName: 'start.txt',
      sentenceId: 3,
      stageState: {
        showTitle: false,
      },
    })
  })

  it('消费快速预览超时事件后会记录超时诊断信息', () => {
    const store = usePreviewSyncStore()

    store.consumeHostEvent(JSON.stringify({
      kind: 'event',
      type: 'preview.event.fast-preview-timeout',
      payload: {
        sceneName: 'scene/start.txt',
        sentenceId: 8,
        targetSentenceId: 12,
        forwardedLineCount: 24,
        elapsedMs: 151,
        maxDurationMs: 150,
      },
    }))

    expect(store.fastPreviewTimeout).toEqual({
      sceneName: 'scene/start.txt',
      sentenceId: 8,
      targetSentenceId: 12,
      forwardedLineCount: 24,
      elapsedMs: 151,
      maxDurationMs: 150,
    })
  })

  it('resetEmbeddedPreviewState 会清空就绪标记与舞台快照', () => {
    const store = usePreviewSyncStore()

    store.consumeHostEvent(JSON.stringify({
      kind: 'event',
      type: 'preview.ready.updated',
      payload: {
        ready: true,
      },
    }))
    store.consumeHostEvent(JSON.stringify({
      kind: 'event',
      type: 'stage.snapshot.updated',
      payload: {
        sceneName: 'start.txt',
        sentenceId: 3,
        stageState: {
          showTitle: false,
        },
      },
    }))
    store.consumeHostEvent(JSON.stringify({
      kind: 'event',
      type: 'preview.event.fast-preview-timeout',
      payload: {
        sceneName: 'scene/start.txt',
        sentenceId: 8,
        targetSentenceId: 12,
        forwardedLineCount: 24,
        elapsedMs: 151,
        maxDurationMs: 150,
      },
    }))
    store.resetEmbeddedPreviewState()

    expect(store.isPreviewReady).toBe(false)
    expect(store.stageSnapshot).toBeUndefined()
    expect(store.fastPreviewTimeout).toBeUndefined()
  })

  it('sendPreviewCommand 会发送 V1 请求封装', async () => {
    const store = usePreviewSyncStore()

    await store.sendPreviewCommand('preview.command.sync-scene', {
      sceneName: 'scene/start.txt',
      sentenceId: 7,
    })

    expect(sendPreviewCommandMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(sendPreviewCommandMock.mock.calls[0][0])).toMatchObject({
      kind: 'request',
      type: 'preview.command.sync-scene',
      payload: {
        sceneName: 'scene/start.txt',
        sentenceId: 7,
      },
    })
  })
})
