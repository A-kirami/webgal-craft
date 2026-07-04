import {
  isSetTransformCommand,
  selectTransformBaseline,
} from './model'

import type { ResolvedTransformBaseline } from './model'
import type { commandType } from 'webgal-parser/src/interface/sceneInterface'
import type { Transform } from '~/domain/stage/types'

export type BaseTransformQueryResult =
  | {
    status: 'ready'
    transform: Transform
  }
  | {
    status: 'unavailable'
    reason?: string
  }

export type TransformBaselineQueryResult =
  | {
    status: 'ready'
    transform: Transform
  }
  | {
    status: 'loading'
  }
  | {
    status: 'unavailable'
    reason?: string
  }

export interface TransformBaselineSessionRequest {
  command: commandType
  lineCommandString: string
  scenePath: string
  sentenceId: number
  target?: string
  writeDefault: boolean
}

export interface TransformBaselineSessionClient {
  queryBaseTransform: () => Promise<BaseTransformQueryResult>
  queryTransformBaseline: (
    target: string,
    transformBaselineRevision: string,
  ) => Promise<TransformBaselineQueryResult>
  syncScene: (
    scenePath: string,
    sentenceId: number,
    lineCommandString: string,
    options?: {
      transformBaselineRevision?: string
      settleMode?: 'immediate'
    },
  ) => Promise<void>
}

export interface ResolveTransformBaselineSessionOptions {
  client: TransformBaselineSessionClient
  request: TransformBaselineSessionRequest
  createTransformBaselineRevision?: () => string
  maxTargetLoadingRetries?: number
}

const DEFAULT_TARGET_LOADING_RETRIES = 2

function createDefaultTransformBaselineRevision(): string {
  return globalThis.crypto?.randomUUID?.()
    ?? `effect-transform-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isBaseTransformReady(
  result: BaseTransformQueryResult,
): result is Extract<BaseTransformQueryResult, { status: 'ready' }> {
  return result.status === 'ready'
}

async function queryTransformBaselineWithRetry(
  client: TransformBaselineSessionClient,
  target: string,
  transformBaselineRevision: string,
  maxLoadingRetries: number,
  loadingCount: number = 0,
): Promise<TransformBaselineQueryResult> {
  const result = await client.queryTransformBaseline(target, transformBaselineRevision)
  if (result.status !== 'loading') {
    return result
  }

  if (loadingCount >= maxLoadingRetries) {
    return {
      status: 'unavailable',
      reason: 'target transform loading retry exhausted',
    }
  }

  return queryTransformBaselineWithRetry(
    client,
    target,
    transformBaselineRevision,
    maxLoadingRetries,
    loadingCount + 1,
  )
}

export async function resolveTransformBaselineSession(
  options: ResolveTransformBaselineSessionOptions,
): Promise<ResolvedTransformBaseline> {
  const {
    client,
    request,
  } = options
  const maxTargetLoadingRetries = options.maxTargetLoadingRetries ?? DEFAULT_TARGET_LOADING_RETRIES
  const baseTransformResult = await client.queryBaseTransform()
  const readyBaseTransform = isBaseTransformReady(baseTransformResult)
    ? baseTransformResult.transform
    : undefined

  if (
    !isSetTransformCommand(request.command)
    || request.writeDefault
    || !request.target
    || !readyBaseTransform
  ) {
    await client.syncScene(
      request.scenePath,
      request.sentenceId,
      request.lineCommandString,
      {
        settleMode: 'immediate',
      },
    )
    return selectTransformBaseline({
      baseTransform: readyBaseTransform,
      command: request.command,
      writeDefault: request.writeDefault,
    })
  }

  const transformBaselineRevision = options.createTransformBaselineRevision?.() ?? createDefaultTransformBaselineRevision()
  await client.syncScene(
    request.scenePath,
    request.sentenceId,
    request.lineCommandString,
    {
      transformBaselineRevision,
      settleMode: 'immediate',
    },
  )

  const transformBaselineResult = await queryTransformBaselineWithRetry(
    client,
    request.target,
    transformBaselineRevision,
    maxTargetLoadingRetries,
  )

  return selectTransformBaseline({
    baseTransform: readyBaseTransform,
    command: request.command,
    targetTransform: transformBaselineResult.status === 'ready'
      ? transformBaselineResult.transform
      : undefined,
    writeDefault: request.writeDefault,
  })
}
