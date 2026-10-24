import { describe, expect, it } from 'vitest'

import { resolveEngineGameConfigCapabilities } from '../game-config-capabilities'

describe('resolveEngineGameConfigCapabilities', () => {
  it.each([
    ['4.6.2', false],
    ['4.6.5', false],
    ['4.6.6-beta.1', false],
    ['4.6.6', true],
    ['4.10.0', true],
    [undefined, false],
    ['invalid', false],
  ] as const)('Live2D 引擎版本为 %s 时，预留内存支持为 %s', (webgalVersion, expected) => {
    expect(resolveEngineGameConfigCapabilities({ webgalVersion, live2dSupport: true })).toEqual({
      cubismMemoryReservedSize: expected,
      legacyExpressionBlendMode: true,
    })
  })

  it.each([false, undefined])('Live2D 声明为 %s 时即使版本足够也隐藏相关配置', (live2dSupport) => {
    expect(resolveEngineGameConfigCapabilities({ webgalVersion: '4.6.6', live2dSupport })).toEqual({
      cubismMemoryReservedSize: false,
      legacyExpressionBlendMode: false,
    })
  })

  it('引擎记录缺失时隐藏依赖 Live2D 的配置', () => {
    expect(resolveEngineGameConfigCapabilities(undefined)).toEqual({
      cubismMemoryReservedSize: false,
      legacyExpressionBlendMode: false,
    })
  })
})
