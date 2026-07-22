import { serverCmds } from '~/commands/server'
import { usePreferenceStore } from '~/stores/preference'
import { createRequestEnvelope } from '~/types/editorPreviewProtocol'

import type {
  PreviewCommandType,
  PreviewRequestType,
  RequestEnvelopeByType,
  RequestPayloadByType,
} from '~/types/editorPreviewProtocol'

export const PREVIEW_STATE_RESET_REASON = 'preview state reset'

export function isPreviewPanelOpen(): boolean {
  return usePreferenceStore().showPreviewPanel
}

export function isPreviewStateResetError(error: unknown): boolean {
  return error instanceof Error && error.message === PREVIEW_STATE_RESET_REASON
}

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

/**
 * 通过 Tauri IPC 发送预览请求，但不等待预览端 ack 或响应。
 * 返回的 promise 只表示本地命令派发完成。
 */
export async function sendPreviewRequestEnvelope<TType extends PreviewRequestType>(
  request: RequestEnvelopeByType<TType>,
): Promise<void> {
  if (!isPreviewPanelOpen()) {
    throw new Error(PREVIEW_STATE_RESET_REASON)
  }

  await serverCmds.sendPreviewCommand(JSON.stringify(request))
}

/**
 * 发送预览命令请求，但不会注册到待处理响应跟踪器。
 * 调用方需要 ack、响应或超时处理时，应使用预览同步 store。
 */
export async function sendPreviewCommandRequest<TType extends PreviewCommandType>(
  type: TType,
  payload: RequestPayloadByType[TType],
): Promise<void> {
  if (!isPreviewPanelOpen()) {
    return
  }

  const request = createPreviewRequestEnvelope(type, payload)
  try {
    await sendPreviewRequestEnvelope(request)
  } catch (error) {
    if (isPreviewStateResetError(error)) {
      return
    }

    throw error
  }
}
