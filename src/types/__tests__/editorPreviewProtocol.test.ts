import { describe, expect, it } from 'vitest'

import {
  isEventEnvelope,
  isHostEventEnvelope,
  isPreviewCommandRequestEnvelope,
  isPreviewCommandType,
  isPreviewRequestEnvelope,
  isPreviewRequestType,
  isPreviewResponseEnvelope,
} from '../editorPreviewProtocol'

describe('editorPreviewProtocol', () => {
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

  it('暴露预览命令类型守卫', () => {
    expect(isPreviewCommandType('preview.command.sync-scene')).toBe(true)
    expect(isPreviewCommandType('preview.command.run-snippet')).toBe(true)
    expect(isPreviewCommandType('preview.command.set-text-read-mode')).toBe(true)
    expect(isPreviewCommandType('preview.command.unknown')).toBe(false)
    expect(isPreviewCommandType('session.register-preview')).toBe(false)
    expect(isPreviewCommandType('preview.query.reference-box')).toBe(false)
    expect(isPreviewCommandType('preview.query.base-transform')).toBe(false)
  })

  it('暴露预览请求类型守卫', () => {
    expect(isPreviewRequestType('preview.command.sync-scene')).toBe(true)
    expect(isPreviewRequestType('preview.query.reference-box')).toBe(true)
    expect(isPreviewRequestType('preview.query.base-transform')).toBe(true)
    expect(isPreviewRequestType('preview.query.transform-baseline')).toBe(true)
    expect(isPreviewRequestType('preview.query.unknown')).toBe(false)
    expect(isPreviewRequestType('session.register-preview')).toBe(false)
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

  it('接受带 preview phase 的效果预览命令请求', () => {
    expect(
      isPreviewCommandRequestEnvelope({
        kind: 'request',
        type: 'preview.command.set-effect',
        requestId: 'req-set-effect-preview',
        payload: {
          target: 'fig-center',
          transform: {
            position: { x: 24 },
          },
          phase: 'preview',
        },
      }),
    ).toBe(true)
  })

  it('仅接受受支持的预览请求', () => {
    expect(
      isPreviewRequestEnvelope({
        kind: 'request',
        type: 'preview.query.reference-box',
        requestId: 'req-reference-box',
        payload: {
          target: 'fig-center',
        },
      }),
    ).toBe(true)

    expect(
      isPreviewRequestEnvelope({
        kind: 'request',
        type: 'preview.query.transform-baseline',
        requestId: 'req-transform-baseline',
        payload: {
          target: 'fig-center',
          transformBaselineRevision: 'rev-effect-1',
        },
      }),
    ).toBe(true)

    expect(
      isPreviewRequestEnvelope({
        kind: 'request',
        type: 'session.register-preview',
        requestId: 'req-register-preview',
        payload: {},
      }),
    ).toBe(false)

    expect(
      isPreviewRequestEnvelope({
        kind: 'event',
        type: 'preview.query.reference-box',
        payload: {},
      }),
    ).toBe(false)
  })

  it('仅接受受支持的预览响应', () => {
    expect(
      isPreviewResponseEnvelope({
        kind: 'response',
        type: 'preview.query.reference-box',
        requestId: 'req-reference-box',
        payload: {
          target: 'fig-center',
          status: 'ready',
        },
      }),
    ).toBe(true)

    expect(
      isPreviewResponseEnvelope({
        kind: 'response',
        type: 'preview.query.transform-baseline',
        requestId: 'req-transform-baseline',
        payload: {
          status: 'ready',
          transform: {
            position: { x: 1000 },
          },
        },
      }),
    ).toBe(true)

    expect(
      isPreviewResponseEnvelope({
        kind: 'response',
        type: 'session.register-preview',
        requestId: 'req-register-preview',
        payload: {},
      }),
    ).toBe(false)
  })
})
