import { describe, expect, it } from 'vitest'

import {
  createRequestEnvelope,
  isEventEnvelope,
  isHostEventEnvelope,
  isPreviewCommandRequestEnvelope,
  isPreviewCommandType,
} from '../editorPreviewProtocol'

describe('editorPreviewProtocol 协议定义', () => {
  it('暴露 V1 子协议常量', async () => {
    const moduleUrl = new URL('../editorPreviewProtocol.ts', import.meta.url)

    await expect(import(moduleUrl.href)).resolves.toMatchObject({
      EDITOR_PREVIEW_PROTOCOL_V1_SUBPROTOCOL: 'webgal-editor-preview-sync.v1',
    })
  })

  it('在本地构造 register-preview 请求', () => {
    expect(createRequestEnvelope('session.register-preview', 'req-register-preview', {
      gameId: 'demo-game',
      embeddedLaunchId: 'embedded-launch-1',
    })).toEqual({
      kind: 'request',
      type: 'session.register-preview',
      requestId: 'req-register-preview',
      payload: {
        gameId: 'demo-game',
        embeddedLaunchId: 'embedded-launch-1',
      },
    })
  })

  it('接受宿主端的就绪事件', () => {
    expect(isEventEnvelope({
      kind: 'event',
      type: 'preview.ready.updated',
      payload: {
        ready: true,
      },
    })).toBe(true)
  })

  it('接受宿主端的舞台快照事件', () => {
    expect(isEventEnvelope({
      kind: 'event',
      type: 'stage.snapshot.updated',
      payload: {
        sceneName: 'scene/start.txt',
        sentenceId: 3,
        stageState: {
          showTitle: false,
        },
      },
    })).toBe(true)
  })

  it('接受快速预览超时事件', () => {
    expect(isHostEventEnvelope({
      kind: 'event',
      type: 'preview.event.fast-preview-timeout',
      payload: {
        sceneName: 'scene/start.txt',
        sentenceId: 3,
        targetSentenceId: 12,
        forwardedLineCount: 9,
        elapsedMs: 151,
        maxDurationMs: 150,
      },
    })).toBe(true)
  })

  it('仅接受受支持的宿主事件类型', () => {
    expect(isHostEventEnvelope({
      kind: 'event',
      type: 'preview.ready.updated',
      payload: {
        ready: true,
      },
    })).toBe(true)

    expect(isHostEventEnvelope({
      kind: 'event',
      type: 'preview.command.sync-scene',
      payload: {},
    })).toBe(false)

    expect(isHostEventEnvelope({
      kind: 'request',
      type: 'preview.ready.updated',
      requestId: 'req-host-event',
      payload: {
        ready: true,
      },
    })).toBe(false)
  })

  it('在本地构造 sync-scene 请求', () => {
    expect(createRequestEnvelope('preview.command.sync-scene', 'req-sync-scene', {
      sceneName: 'scene/start.txt',
      sentenceId: 7,
    })).toEqual({
      kind: 'request',
      type: 'preview.command.sync-scene',
      requestId: 'req-sync-scene',
      payload: {
        sceneName: 'scene/start.txt',
        sentenceId: 7,
      },
    })
  })

  it('在本地构造 text-read-mode 请求', () => {
    expect(createRequestEnvelope('preview.command.set-text-read-mode', 'req-text-read-mode', {
      isRead: true,
    })).toEqual({
      kind: 'request',
      type: 'preview.command.set-text-read-mode',
      requestId: 'req-text-read-mode',
      payload: {
        isRead: true,
      },
    })
  })

  it('暴露预览命令类型守卫', () => {
    expect(isPreviewCommandType('preview.command.sync-scene')).toBe(true)
    expect(isPreviewCommandType('preview.command.run-snippet')).toBe(true)
    expect(isPreviewCommandType('preview.command.set-text-read-mode')).toBe(true)
    expect(isPreviewCommandType('preview.command.unknown')).toBe(false)
    expect(isPreviewCommandType('session.register-preview')).toBe(false)
  })

  it('仅接受可执行的预览命令请求', () => {
    expect(
      isPreviewCommandRequestEnvelope({
        kind: 'request',
        type: 'preview.command.sync-scene',
        requestId: 'req-sync-scene',
        payload: {
          sceneName: 'scene/start.txt',
          sentenceId: 0,
        },
      }),
    ).toBe(true)

    expect(
      isPreviewCommandRequestEnvelope({
        kind: 'request',
        type: 'session.register-preview',
        requestId: 'req-register-preview',
        payload: {},
      }),
    ).toBe(false)

    expect(
      isPreviewCommandRequestEnvelope({
        kind: 'request',
        type: 'preview.command.unknown',
        requestId: 'req-unknown-command',
        payload: {},
      }),
    ).toBe(false)

    expect(
      isPreviewCommandRequestEnvelope({
        kind: 'event',
        type: 'preview.command.sync-scene',
        payload: {},
      }),
    ).toBe(false)
  })
})
