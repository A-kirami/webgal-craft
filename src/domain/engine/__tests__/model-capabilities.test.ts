import { describe, expect, it } from 'vitest'

import {
  classifyEngineModelReference,
  resolveEngineModelCapabilities,
} from '../model-capabilities'

describe('resolveEngineModelCapabilities', () => {
  it('只有显式声明为 true 的模型能力才视为受支持', () => {
    expect(resolveEngineModelCapabilities({})).toEqual({
      live2d: false,
      spine: false,
    })
    expect(resolveEngineModelCapabilities({
      live2dSupport: true,
      spineSupport: false,
    })).toEqual({
      live2d: true,
      spine: false,
    })
    expect(resolveEngineModelCapabilities({
      live2dSupport: false,
      spineSupport: true,
    })).toEqual({
      live2d: false,
      spine: true,
    })
  })
})

describe('classifyEngineModelReference', () => {
  it.each([
    ['figure/hero.json', 'live2d'],
    ['figure/HERO.JSON?version=1', 'live2d'],
    ['figure/hero.json?type=spine', 'spine'],
    ['figure/hero.json?version=1&type=SPINE', 'spine'],
    ['figure/hero.skel', 'spine'],
    ['figure/HERO.SKEL?version=1', 'spine'],
    ['figure/hero.png', undefined],
  ] as const)('将 %s 分类为 %s', (reference, expected) => {
    expect(classifyEngineModelReference(reference)).toBe(expected)
  })
})
