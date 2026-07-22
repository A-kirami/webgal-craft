import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePreferenceStore } from '../preference'
import { usePreviewSyncStore } from '../preview-sync'

const {
  loggerErrorMock,
  sendPreviewCommandMock,
} = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  sendPreviewCommandMock: vi.fn(),
}))

vi.mock('~/commands/server', () => ({
  serverCmds: {
    sendPreviewCommand: sendPreviewCommandMock,
  },
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  debug: vi.fn(),
  error: loggerErrorMock,
  warn: vi.fn(),
}))

describe('usePreviewSyncStore', () => {
  beforeEach(() => {
    loggerErrorMock.mockReset()
    sendPreviewCommandMock.mockReset()
    vi.useRealTimers()
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

  it('重置内嵌预览状态时会清空就绪标记与舞台快照', () => {
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

  it('会发送引用框查询并使用响应载荷完成请求', async () => {
    const store = usePreviewSyncStore()
    const pending = store.queryReferenceBox('fig-left')

    expect(sendPreviewCommandMock).toHaveBeenCalledTimes(1)
    const request = JSON.parse(sendPreviewCommandMock.mock.calls[0][0])
    expect(request).toMatchObject({
      kind: 'request',
      type: 'preview.query.reference-box',
      payload: {
        target: 'fig-left',
      },
    })

    store.consumeHostEvent(JSON.stringify({
      kind: 'response',
      type: 'preview.query.reference-box',
      requestId: request.requestId,
      payload: {
        target: 'fig-left',
        status: 'ready',
        box: {
          originX: 640,
          originY: 360,
          width: 200,
          height: 100,
          anchorX: 0.5,
          anchorY: 0.5,
          stageWidth: 1280,
          stageHeight: 720,
        },
      },
    }))

    await expect(pending).resolves.toEqual({
      target: 'fig-left',
      status: 'ready',
      box: {
        originX: 640,
        originY: 360,
        width: 200,
        height: 100,
        anchorX: 0.5,
        anchorY: 0.5,
        stageWidth: 1280,
        stageHeight: 720,
      },
    })
  })

  it('会发送基础变换查询并使用响应载荷完成请求', async () => {
    const store = usePreviewSyncStore()
    const pending = store.queryBaseTransform()

    expect(sendPreviewCommandMock).toHaveBeenCalledTimes(1)
    const request = JSON.parse(sendPreviewCommandMock.mock.calls[0][0])
    expect(request).toMatchObject({
      kind: 'request',
      type: 'preview.query.base-transform',
      payload: {},
    })

    store.consumeHostEvent(JSON.stringify({
      kind: 'response',
      type: 'preview.query.base-transform',
      requestId: request.requestId,
      payload: {
        baseTransform: {
          position: { x: 0, y: 20 },
          scale: { x: 1, y: 1 },
        },
      },
    }))

    await expect(pending).resolves.toEqual({
      status: 'ready',
      transform: {
        position: { x: 0, y: 20 },
        scale: { x: 1, y: 1 },
      },
    })
  })

  it('基础变换查询收到非法载荷时返回不可用且不写入缓存', async () => {
    const store = usePreviewSyncStore()
    const pending = store.queryBaseTransform()
    const request = JSON.parse(sendPreviewCommandMock.mock.calls[0][0])

    store.consumeHostEvent(JSON.stringify({
      kind: 'response',
      type: 'preview.query.base-transform',
      requestId: request.requestId,
      payload: {
        baseTransform: [],
      },
    }))

    await expect(pending).resolves.toEqual({
      status: 'unavailable',
      reason: 'invalid response',
    })

    void store.queryBaseTransform()
    expect(sendPreviewCommandMock).toHaveBeenCalledTimes(2)
  })

  it('会发送绑定修订号的变换基线查询', async () => {
    const store = usePreviewSyncStore()
    const pending = store.queryTransformBaseline('fig-center', 'rev-effect-1')

    expect(sendPreviewCommandMock).toHaveBeenCalledTimes(1)
    const request = JSON.parse(sendPreviewCommandMock.mock.calls[0][0])
    expect(request).toMatchObject({
      kind: 'request',
      type: 'preview.query.transform-baseline',
      payload: {
        target: 'fig-center',
        transformBaselineRevision: 'rev-effect-1',
      },
    })

    store.consumeHostEvent(JSON.stringify({
      kind: 'response',
      type: 'preview.query.transform-baseline',
      requestId: request.requestId,
      payload: {
        status: 'ready',
        transform: {
          position: { x: 1000 },
        },
      },
    }))

    await expect(pending).resolves.toEqual({
      status: 'ready',
      transform: {
        position: { x: 1000 },
      },
    })
  })

  it('变换基线查询收到非法载荷时返回不可用', async () => {
    const store = usePreviewSyncStore()
    const pending = store.queryTransformBaseline('fig-center', 'rev-effect-1')
    const request = JSON.parse(sendPreviewCommandMock.mock.calls[0][0])

    store.consumeHostEvent(JSON.stringify({
      kind: 'response',
      type: 'preview.query.transform-baseline',
      requestId: request.requestId,
      payload: {
        status: 'ready',
      },
    }))

    await expect(pending).resolves.toEqual({
      status: 'unavailable',
      reason: 'invalid response',
    })
  })

  it('引用框查询超时时会返回不支持结果', async () => {
    vi.useFakeTimers()
    const store = usePreviewSyncStore()
    const pending = store.queryReferenceBox('fig-left', { timeoutMs: 50 })

    await vi.advanceTimersByTimeAsync(50)

    await expect(pending).resolves.toEqual({
      target: 'fig-left',
      status: 'unsupported',
      reason: 'reference box query timeout',
    })
  })

  it('重置内嵌预览状态时会取消待处理的变换查询', async () => {
    const store = usePreviewSyncStore()
    const pending = store.queryTransformBaseline('fig-center', 'rev-effect-1', { timeoutMs: 1000 })

    store.resetEmbeddedPreviewState()

    await expect(pending).resolves.toEqual({
      status: 'unavailable',
      reason: 'preview state reset',
    })
  })

  it('待处理查询被重置取消后会忽略迟到的发送失败', async () => {
    let rejectSend: ((error: Error) => void) | undefined
    sendPreviewCommandMock.mockImplementationOnce(() => new Promise((_, reject) => {
      rejectSend = reject
    }))

    const store = usePreviewSyncStore()
    const pending = store.queryTransformBaseline('fig-center', 'rev-effect-1', { timeoutMs: 1000 })

    store.resetEmbeddedPreviewState()
    rejectSend?.(new Error('send failed'))

    await expect(pending).resolves.toEqual({
      status: 'unavailable',
      reason: 'preview state reset',
    })
    expect(loggerErrorMock).not.toHaveBeenCalled()
  })

  it('通用请求错误响应会取消待处理的变换查询', async () => {
    const store = usePreviewSyncStore()
    const pending = store.queryTransformBaseline('fig-center', 'rev-effect-1', { timeoutMs: 1000 })
    const request = JSON.parse(sendPreviewCommandMock.mock.calls[0][0])

    store.consumeHostEvent(JSON.stringify({
      kind: 'error',
      type: 'preview.query.transform-baseline',
      requestId: request.requestId,
      error: {
        code: 'unsupported-request-type',
        message: 'transform baseline query is not supported',
      },
    }))

    await expect(pending).resolves.toEqual({
      status: 'unavailable',
      reason: 'transform baseline query is not supported',
    })
  })

  it('会发送 command 并等待同 requestId 的 accepted 响应', async () => {
    const store = usePreviewSyncStore()
    const pending = store.sendPreviewCommand('preview.command.set-effect', {
      target: 'fig-center',
      transform: {
        blur: 12,
      },
      phase: 'preview',
    })

    expect(sendPreviewCommandMock).toHaveBeenCalledTimes(1)
    const request = JSON.parse(sendPreviewCommandMock.mock.calls[0][0])
    expect(request).toMatchObject({
      kind: 'request',
      type: 'preview.command.set-effect',
      payload: {
        target: 'fig-center',
        transform: {
          blur: 12,
        },
        phase: 'preview',
      },
    })

    store.consumeHostEvent(JSON.stringify({
      kind: 'response',
      type: 'preview.command.set-effect',
      requestId: request.requestId,
      payload: {},
    }))

    await expect(pending).resolves.toBeUndefined()
  })

  it('command 收到同 requestId 错误响应时会拒绝请求', async () => {
    const store = usePreviewSyncStore()
    const pending = store.sendPreviewCommand('preview.command.set-effect', {
      target: 'fig-center',
      transform: {
        blur: 12,
      },
      phase: 'commit',
    })
    const request = JSON.parse(sendPreviewCommandMock.mock.calls[0][0])

    store.consumeHostEvent(JSON.stringify({
      kind: 'error',
      type: 'preview.command.set-effect',
      requestId: request.requestId,
      error: {
        code: 'internal-error',
        message: 'set effect failed',
      },
    }))

    await expect(pending).rejects.toThrow('set effect failed')
  })

  it('预览面板关闭时会丢弃请求，重新打开后恢复发送', async () => {
    const preferenceStore = usePreferenceStore()
    const store = usePreviewSyncStore()
    const pendingBeforeClose = store.queryReferenceBox('fig-center')

    preferenceStore.showPreviewPanel = false

    await expect(store.queryReferenceBox('fig-center')).resolves.toEqual({
      target: 'fig-center',
      status: 'unsupported',
      reason: 'preview state reset',
    })
    await expect(pendingBeforeClose).resolves.toEqual({
      target: 'fig-center',
      status: 'unsupported',
      reason: 'preview state reset',
    })
    await expect(store.sendPreviewCommand('preview.command.set-effect', {
      target: 'fig-center',
      transform: { blur: 12 },
    })).rejects.toThrow('preview state reset')
    expect(sendPreviewCommandMock).toHaveBeenCalledTimes(1)

    preferenceStore.showPreviewPanel = true
    const pending = store.queryReferenceBox('fig-center')
    expect(sendPreviewCommandMock).toHaveBeenCalledTimes(2)
    const request = JSON.parse(sendPreviewCommandMock.mock.calls[1][0])
    store.consumeHostEvent(JSON.stringify({
      kind: 'response',
      type: 'preview.query.reference-box',
      requestId: request.requestId,
      payload: {
        target: 'fig-center',
        status: 'unsupported',
        reason: 'not ready',
      },
    }))

    await expect(pending).resolves.toEqual({
      target: 'fig-center',
      status: 'unsupported',
      reason: 'not ready',
    })
  })

  it('预览面板关闭时不会继续使用缓存的基础变换', async () => {
    const store = usePreviewSyncStore()
    const pending = store.queryBaseTransform()
    const request = JSON.parse(sendPreviewCommandMock.mock.calls[0][0])

    store.consumeHostEvent(JSON.stringify({
      kind: 'response',
      type: 'preview.query.base-transform',
      requestId: request.requestId,
      payload: {
        baseTransform: {
          position: { x: 12 },
        },
      },
    }))
    await expect(pending).resolves.toEqual({
      status: 'ready',
      transform: {
        position: { x: 12 },
      },
    })

    usePreferenceStore().showPreviewPanel = false
    await expect(store.queryBaseTransform()).resolves.toEqual({
      status: 'unavailable',
      reason: 'preview state reset',
    })
    expect(sendPreviewCommandMock).toHaveBeenCalledTimes(1)
  })
})
