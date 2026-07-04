import { describe, expect, it, vi } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { resolveTransformBaselineSession } from '../baseline-session'

import type {
  BaseTransformQueryResult,
  TransformBaselineQueryResult,
  TransformBaselineSessionClient,
} from '../baseline-session'

function createClient(options: {
  baseTransform: BaseTransformQueryResult
  transformBaselines?: TransformBaselineQueryResult[]
}): TransformBaselineSessionClient {
  const baselineQueue = [...(options.transformBaselines ?? [])]

  return {
    queryBaseTransform: vi.fn(async () => options.baseTransform),
    queryTransformBaseline: vi.fn(async () => {
      const result = baselineQueue.shift()
      if (!result) {
        throw new Error('transform baseline queue exhausted')
      }

      return result
    }),
    syncScene: vi.fn(async () => { /* no-op */ }),
  }
}

describe('resolveTransformBaselineSession', () => {
  it('普通变换命令只使用基础变换并发送不带修订号的同步请求', async () => {
    const client = createClient({
      baseTransform: {
        status: 'ready',
        transform: {
          position: { x: 0, y: 20 },
        },
      },
      transformBaselines: [
        {
          status: 'ready',
          transform: {
            position: { x: 1000 },
          },
        },
      ],
    })

    await expect(resolveTransformBaselineSession({
      client,
      request: {
        command: commandType.changeFigure,
        lineCommandString: 'changeFigure:figure.png;',
        scenePath: 'scene/start.txt',
        sentenceId: 3,
        target: 'fig-center',
        writeDefault: false,
      },
    })).resolves.toEqual({
      baselineSource: 'base',
      baselineTransform: {
        position: { x: 0, y: 20 },
      },
    })

    expect(client.syncScene).toHaveBeenCalledWith(
      'scene/start.txt',
      3,
      'changeFigure:figure.png;',
      {
        settleMode: 'immediate',
      },
    )
    expect(client.queryTransformBaseline).not.toHaveBeenCalled()
  })

  it('专用变换命令写入默认值时不会创建目标基线查询', async () => {
    const client = createClient({
      baseTransform: {
        status: 'ready',
        transform: {
          scale: { x: 1, y: 1 },
        },
      },
    })

    await expect(resolveTransformBaselineSession({
      client,
      request: {
        command: commandType.setTransform,
        lineCommandString: 'setTransform:;',
        scenePath: 'scene/start.txt',
        sentenceId: 4,
        target: 'fig-center',
        writeDefault: true,
      },
      createTransformBaselineRevision: () => 'rev-effect-1',
    })).resolves.toEqual({
      baselineSource: 'base',
      baselineTransform: {
        scale: { x: 1, y: 1 },
      },
    })

    expect(client.syncScene).toHaveBeenCalledWith(
      'scene/start.txt',
      4,
      'setTransform:;',
      {
        settleMode: 'immediate',
      },
    )
    expect(client.queryTransformBaseline).not.toHaveBeenCalled()
  })

  it('专用变换命令继承模式会用同一个修订号同步后查询目标并重试加载状态', async () => {
    const client = createClient({
      baseTransform: {
        status: 'ready',
        transform: {
          position: { x: 0, y: 20 },
        },
      },
      transformBaselines: [
        {
          status: 'loading',
        },
        {
          status: 'ready',
          transform: {
            position: { x: 1000 },
          },
        },
      ],
    })

    await expect(resolveTransformBaselineSession({
      client,
      request: {
        command: commandType.setTransform,
        lineCommandString: 'setTransform:;',
        scenePath: 'scene/start.txt',
        sentenceId: 5,
        target: 'fig-center',
        writeDefault: false,
      },
      createTransformBaselineRevision: () => 'rev-effect-1',
    })).resolves.toEqual({
      baselineSource: 'protocol',
      baselineTransform: {
        position: { x: 1000, y: 20 },
      },
    })

    expect(client.syncScene).toHaveBeenCalledTimes(1)
    expect(client.syncScene).toHaveBeenCalledWith(
      'scene/start.txt',
      5,
      'setTransform:;',
      {
        transformBaselineRevision: 'rev-effect-1',
        settleMode: 'immediate',
      },
    )
    expect(client.queryTransformBaseline).toHaveBeenCalledTimes(2)
    expect(client.queryTransformBaseline).toHaveBeenNthCalledWith(1, 'fig-center', 'rev-effect-1')
    expect(client.queryTransformBaseline).toHaveBeenNthCalledWith(2, 'fig-center', 'rev-effect-1')
  })

  it('目标基线加载重试耗尽后会降级为未知来源', async () => {
    const client = createClient({
      baseTransform: {
        status: 'ready',
        transform: {
          position: { x: 0, y: 20 },
        },
      },
      transformBaselines: [
        {
          status: 'loading',
        },
      ],
    })

    await expect(resolveTransformBaselineSession({
      client,
      request: {
        command: commandType.setTransform,
        lineCommandString: 'setTransform:;',
        scenePath: 'scene/start.txt',
        sentenceId: 5,
        target: 'fig-center',
        writeDefault: false,
      },
      createTransformBaselineRevision: () => 'rev-effect-1',
      maxTargetLoadingRetries: 0,
    })).resolves.toEqual({
      baselineSource: 'unknown',
    })
  })
})
