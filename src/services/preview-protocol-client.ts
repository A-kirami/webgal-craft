import { serverCmds } from '~/commands/server'
import { createRequestEnvelope } from '~/types/editorPreviewProtocol'

import type {
  PreviewCommandType,
  PreviewRequestType,
  RequestEnvelopeByType,
  RequestPayloadByType,
} from '~/types/editorPreviewProtocol'

function createPreviewRequestId(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `preview-sync-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function createPreviewRequestEnvelope<TType extends PreviewRequestType>(
  type: TType,
  payload: RequestPayloadByType[TType],
): RequestEnvelopeByType<TType> {
  return createRequestEnvelope(
    type,
    createPreviewRequestId(),
    payload,
  )
}

export async function sendPreviewRequestEnvelope<TType extends PreviewRequestType>(
  request: RequestEnvelopeByType<TType>,
): Promise<void> {
  await serverCmds.sendPreviewCommand(JSON.stringify(request))
}

export async function sendPreviewCommandRequest<TType extends PreviewCommandType>(
  type: TType,
  payload: RequestPayloadByType[TType],
): Promise<void> {
  const request = createPreviewRequestEnvelope(type, payload)
  await sendPreviewRequestEnvelope(request)
}
