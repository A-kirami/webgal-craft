import { defineStore } from 'pinia'

import {
  createPreviewRequestEnvelope,
  sendPreviewRequestEnvelope,
} from '~/services/preview-protocol-client'
import {
  isHostEventEnvelope,
  isKnownPreviewRequestErrorEnvelope,
  isPreviewResponseEnvelope,
} from '~/types/editorPreviewProtocol'

import type {
  BaseTransformQueryResultPayload,
  EventEnvelopeByType,
  FastPreviewTimeoutPayload,
  HostEventType,
  PreviewCommandType,
  PreviewQueryType,
  PreviewRequestErrorEnvelopeByType,
  PreviewRequestType,
  PreviewResponseType,
  ReferenceBoxQueryResultPayload,
  RequestEnvelopeByType,
  RequestPayloadByType,
  ResponseEnvelopeByType,
  StageSnapshotUpdatedPayload,
  TransformBaselineQueryResultPayload,
} from '~/types/editorPreviewProtocol'

interface ReferenceBoxQueryOptions {
  timeoutMs?: number
}

interface PreviewQueryOptions {
  failureReason?: string
  timeoutMs?: number
  timeoutReason?: string
}

interface PreviewCommandOptions {
  timeoutMs?: number
}

interface PendingPreviewResponse {
  settleFailure: (reason: string) => void
  settleResponse: (message: ResponseEnvelopeByType<PreviewResponseType>) => void
  timeoutId: ReturnType<typeof setTimeout>
  type: PreviewRequestType
}

export type BaseTransformQueryResult =
  | {
    status: 'ready'
    transform: BaseTransformQueryResultPayload['baseTransform']
  }
  | {
    status: 'unavailable'
    reason?: string
  }

export type TransformBaselineQueryResult =
  | Extract<TransformBaselineQueryResultPayload, { status: 'ready' }>
  | Extract<TransformBaselineQueryResultPayload, { status: 'loading' }>
  | {
    status: 'unavailable'
    reason?: string
  }

type PreviewSyncHostMessage =
  | EventEnvelopeByType<HostEventType>
  | ResponseEnvelopeByType<PreviewResponseType>
  | PreviewRequestErrorEnvelopeByType<PreviewRequestType>

const DEFAULT_REFERENCE_BOX_QUERY_TIMEOUT_MS = 300
const DEFAULT_TRANSFORM_QUERY_TIMEOUT_MS = 500
const DEFAULT_PREVIEW_COMMAND_TIMEOUT_MS = 1000

function parseHostMessage(rawEvent: string): PreviewSyncHostMessage | undefined {
  try {
    const parsed = JSON.parse(rawEvent) as unknown
    if (isHostEventEnvelope(parsed) || isPreviewResponseEnvelope(parsed)) {
      return parsed
    }

    if (isKnownPreviewRequestErrorEnvelope(parsed)) {
      return parsed
    }

    return undefined
  } catch (error) {
    logger.debug(`解析预览同步 host event 失败: ${error}`)
    return undefined
  }
}

export const usePreviewSyncStore = defineStore('previewSync', () => {
  let isPreviewReady = $ref(false)
  let stageSnapshot = $ref<StageSnapshotUpdatedPayload>()
  let fastPreviewTimeout = $ref<FastPreviewTimeoutPayload>()
  let cachedBaseTransform = $ref<BaseTransformQueryResultPayload['baseTransform']>()
  const pendingPreviewResponses = new Map<string, PendingPreviewResponse>()

  function cloneCachedBaseTransform(): BaseTransformQueryResultPayload['baseTransform'] | undefined {
    return cachedBaseTransform ? structuredClone(toRaw(cachedBaseTransform)) : undefined
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  function parseBaseTransformResponsePayload(payload: unknown): BaseTransformQueryResult {
    if (!isRecord(payload) || !isRecord(payload.baseTransform)) {
      return {
        status: 'unavailable',
        reason: 'invalid response',
      }
    }

    cachedBaseTransform = structuredClone(payload.baseTransform) as BaseTransformQueryResultPayload['baseTransform']
    return {
      status: 'ready',
      transform: cloneCachedBaseTransform()!,
    }
  }

  function parseTransformBaselineResponsePayload(payload: unknown): TransformBaselineQueryResult {
    if (!isRecord(payload) || typeof payload.status !== 'string') {
      return {
        status: 'unavailable',
        reason: 'invalid response',
      }
    }

    switch (payload.status) {
      case 'ready': {
        return isRecord(payload.transform)
          ? {
              status: 'ready',
              transform: structuredClone(payload.transform) as Extract<TransformBaselineQueryResultPayload, { status: 'ready' }>['transform'],
            }
          : {
              status: 'unavailable',
              reason: 'invalid response',
            }
      }
      case 'loading': {
        return { status: 'loading' }
      }
      case 'unavailable': {
        return { status: 'unavailable' }
      }
      default: {
        return {
          status: 'unavailable',
          reason: 'invalid response',
        }
      }
    }
  }

  function consumeHostEvent(rawEvent: string) {
    const message = parseHostMessage(rawEvent)
    if (!message) {
      return
    }

    if (message.kind === 'response') {
      consumePreviewResponse(message)
      return
    }

    if (message.kind === 'error') {
      consumePreviewRequestError(message)
      return
    }

    switch (message.type) {
      case 'preview.ready.updated': {
        if (!message.payload.ready) {
          resetEmbeddedPreviewState()
          return
        }

        isPreviewReady = message.payload.ready
        return
      }
      case 'stage.snapshot.updated': {
        stageSnapshot = message.payload
        return
      }
      case 'preview.event.fast-preview-timeout': {
        fastPreviewTimeout = message.payload
        logger.debug(
          `实时预览快进超时: scene=${message.payload.sceneName}, target=${message.payload.targetSentenceId}, stopped=${message.payload.sentenceId}, forwarded=${message.payload.forwardedLineCount}, elapsed=${message.payload.elapsedMs}/${message.payload.maxDurationMs}ms`,
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
    cachedBaseTransform = undefined
    settlePendingPreviewResponses('preview state reset')
  }

  function consumePreviewResponse(message: ResponseEnvelopeByType<PreviewResponseType>): void {
    const pending = pendingPreviewResponses.get(message.requestId)
    if (!pending || pending.type !== message.type) {
      return
    }

    pendingPreviewResponses.delete(message.requestId)
    clearTimeout(pending.timeoutId)
    pending.settleResponse(message)
  }

  function consumePreviewRequestError(message: PreviewRequestErrorEnvelopeByType<PreviewRequestType>): void {
    const pending = pendingPreviewResponses.get(message.requestId)
    if (!pending || pending.type !== message.type) {
      return
    }

    pendingPreviewResponses.delete(message.requestId)
    clearTimeout(pending.timeoutId)
    pending.settleFailure(message.error.message ?? message.error.code)
  }

  function settlePendingPreviewResponses(reason: string): void {
    for (const [requestId, pending] of pendingPreviewResponses) {
      pendingPreviewResponses.delete(requestId)
      clearTimeout(pending.timeoutId)
      pending.settleFailure(reason)
    }
  }

  function dismissFastPreviewTimeout() {
    fastPreviewTimeout = undefined
  }

  function sendPreviewQuery(
    request: RequestEnvelopeByType<PreviewQueryType>,
    pending: PendingPreviewResponse,
    failureReason: string,
  ): void {
    const { requestId } = request
    pendingPreviewResponses.set(requestId, pending)
    void sendPreviewRequestEnvelope(request).catch((error) => {
      if (!pendingPreviewResponses.delete(requestId)) {
        return
      }

      clearTimeout(pending.timeoutId)
      logger.error(`发送 ${request.type} 查询失败: ${error}`)
      pending.settleFailure(failureReason)
    })
  }

  function sendPreviewCommand<TType extends PreviewCommandType>(
    type: TType,
    payload: RequestPayloadByType[TType],
    options: PreviewCommandOptions = {},
  ): Promise<void> {
    const request = createPreviewRequestEnvelope(type, payload)
    const { requestId } = request

    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pendingPreviewResponses.delete(requestId)
        reject(new Error(`${type} command timeout`))
      }, options.timeoutMs ?? DEFAULT_PREVIEW_COMMAND_TIMEOUT_MS)

      pendingPreviewResponses.set(requestId, {
        settleFailure(reason) {
          reject(new Error(reason))
        },
        settleResponse(message) {
          if (message.type === type) {
            resolve()
          }
        },
        timeoutId,
        type,
      })

      void sendPreviewRequestEnvelope(request).catch((error) => {
        if (!pendingPreviewResponses.delete(requestId)) {
          return
        }

        clearTimeout(timeoutId)
        logger.error(`发送 ${request.type} command 失败: ${error}`)
        reject(error instanceof Error ? error : new Error(String(error)))
      })
    })
  }

  function queryReferenceBox(
    target: string,
    options: ReferenceBoxQueryOptions = {},
  ): Promise<ReferenceBoxQueryResultPayload> {
    const type = 'preview.query.reference-box'
    const request = createPreviewRequestEnvelope(
      type,
      { target },
    )
    const { requestId } = request

    return new Promise<ReferenceBoxQueryResultPayload>((resolve) => {
      const timeoutId = setTimeout(() => {
        pendingPreviewResponses.delete(requestId)
        resolve({
          target,
          status: 'unsupported',
          reason: 'reference box query timeout',
        })
      }, options.timeoutMs ?? DEFAULT_REFERENCE_BOX_QUERY_TIMEOUT_MS)

      sendPreviewQuery(
        request,
        {
          settleFailure(reason) {
            resolve({
              target,
              status: 'unsupported',
              reason,
            })
          },
          settleResponse(message) {
            if (message.type === type) {
              resolve(message.payload)
            }
          },
          timeoutId,
          type,
        },
        'reference box query failed',
      )
    })
  }

  function queryBaseTransform(options: PreviewQueryOptions = {}): Promise<BaseTransformQueryResult> {
    const cachedTransform = cloneCachedBaseTransform()
    if (cachedTransform) {
      return Promise.resolve({
        status: 'ready',
        transform: cachedTransform,
      })
    }

    const type = 'preview.query.base-transform'
    const request = createPreviewRequestEnvelope(type, {})
    const { requestId } = request

    return new Promise<BaseTransformQueryResult>((resolve) => {
      const timeoutId = setTimeout(() => {
        pendingPreviewResponses.delete(requestId)
        resolve({
          status: 'unavailable',
          reason: options.timeoutReason ?? `${type} query timeout`,
        })
      }, options.timeoutMs ?? DEFAULT_TRANSFORM_QUERY_TIMEOUT_MS)

      sendPreviewQuery(
        request,
        {
          settleFailure(reason) {
            resolve({
              status: 'unavailable',
              reason,
            })
          },
          settleResponse(message) {
            if (message.type === type) {
              resolve(parseBaseTransformResponsePayload(message.payload))
            }
          },
          timeoutId,
          type,
        },
        options.failureReason ?? `${type} query failed`,
      )
    })
  }

  function queryTransformBaseline(
    target: string,
    transformBaselineRevision: string,
    options: PreviewQueryOptions = {},
  ): Promise<TransformBaselineQueryResult> {
    const type = 'preview.query.transform-baseline'
    const request = createPreviewRequestEnvelope(
      type,
      { target, transformBaselineRevision },
    )
    const { requestId } = request

    return new Promise<TransformBaselineQueryResult>((resolve) => {
      const timeoutId = setTimeout(() => {
        pendingPreviewResponses.delete(requestId)
        resolve({
          status: 'unavailable',
          reason: options.timeoutReason ?? `${type} query timeout`,
        })
      }, options.timeoutMs ?? DEFAULT_TRANSFORM_QUERY_TIMEOUT_MS)

      sendPreviewQuery(
        request,
        {
          settleFailure(reason) {
            resolve({
              status: 'unavailable',
              reason,
            })
          },
          settleResponse(message) {
            if (message.type === type) {
              resolve(parseTransformBaselineResponsePayload(message.payload))
            }
          },
          timeoutId,
          type,
        },
        options.failureReason ?? `${type} query failed`,
      )
    })
  }

  return $$({
    isPreviewReady,
    stageSnapshot,
    fastPreviewTimeout,
    consumeHostEvent,
    resetEmbeddedPreviewState,
    dismissFastPreviewTimeout,
    queryReferenceBox,
    queryBaseTransform,
    queryTransformBaseline,
    sendPreviewCommand,
  })
})
