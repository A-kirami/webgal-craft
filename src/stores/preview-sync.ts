import { defineStore } from 'pinia'

import { serverCmds } from '~/commands/server'
import { createRequestEnvelope, isHostEventEnvelope } from '~/types/editorPreviewProtocol'

import type {
  EventEnvelopeByType,
  FastPreviewTimeoutPayload,
  PreviewCommandType,
  RequestPayloadByType,
  StageSnapshotUpdatedPayload,
} from '~/types/editorPreviewProtocol'

function createPreviewRequestId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `preview-sync-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function parseHostEvent(rawEvent: string): EventEnvelopeByType | undefined {
  try {
    const parsed = JSON.parse(rawEvent) as unknown
    if (!isHostEventEnvelope(parsed)) {
      return undefined
    }

    return parsed
  } catch (error) {
    logger.warn(`解析预览同步 host event 失败: ${error}`)
    return undefined
  }
}

export const usePreviewSyncStore = defineStore('previewSync', () => {
  let isPreviewReady = $ref(false)
  let stageSnapshot = $ref<StageSnapshotUpdatedPayload>()
  let fastPreviewTimeout = $ref<FastPreviewTimeoutPayload>()

  function consumeHostEvent(rawEvent: string) {
    const event = parseHostEvent(rawEvent)
    if (!event) {
      return
    }

    switch (event.type) {
      case 'preview.ready.updated': {
        isPreviewReady = event.payload.ready
        return
      }
      case 'stage.snapshot.updated': {
        stageSnapshot = event.payload
        return
      }
      case 'preview.event.fast-preview-timeout': {
        fastPreviewTimeout = event.payload
        logger.warn(
          `实时预览快进超时: scene=${event.payload.sceneName}, target=${event.payload.targetSentenceId}, stopped=${event.payload.sentenceId}, forwarded=${event.payload.forwardedLineCount}, elapsed=${event.payload.elapsedMs}/${event.payload.maxDurationMs}ms`,
        )
        return
      }
      default: {
        return
      }
    }
  }

  function resetEmbeddedPreviewState() {
    isPreviewReady = false
    stageSnapshot = undefined
    fastPreviewTimeout = undefined
  }

  function dismissFastPreviewTimeout() {
    fastPreviewTimeout = undefined
  }

  async function sendPreviewCommand<TType extends PreviewCommandType>(
    type: TType,
    payload: RequestPayloadByType[TType],
  ) {
    const request = createRequestEnvelope(
      type,
      createPreviewRequestId(),
      payload,
    )
    await serverCmds.sendPreviewCommand(JSON.stringify(request))
  }

  return $$({
    isPreviewReady,
    stageSnapshot,
    fastPreviewTimeout,
    consumeHostEvent,
    resetEmbeddedPreviewState,
    dismissFastPreviewTimeout,
    sendPreviewCommand,
  })
})
