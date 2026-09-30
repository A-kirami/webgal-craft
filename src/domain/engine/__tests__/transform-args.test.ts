import { describe, expect, it } from 'vitest'

import { LATEST_ENGINE_RUNTIME_CAPABILITIES, LEGACY_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'
import { resolveTransformWriteMode } from '~/domain/engine/transform-args'
import { parseSentence } from '~/domain/script/parser'

import type { TransformWriteMode } from '~/domain/engine/transform-args'

function resolve(rawText: string, supportsTransformFrom: boolean): TransformWriteMode {
  const sentence = parseSentence(rawText)
  if (!sentence) {
    throw new Error(`无法解析语句：${rawText}`)
  }

  return resolveTransformWriteMode(sentence, supportsTransformFrom
    ? LATEST_ENGINE_RUNTIME_CAPABILITIES
    : LEGACY_ENGINE_RUNTIME_CAPABILITIES)
}

describe('resolveTransformWriteMode', () => {
  it('新引擎下 transformFrom 优先于同句的旧参数', () => {
    expect(resolve('setTransform: {} -transformFrom=default;', true)).toEqual({
      transformFrom: 'default',
      writeDefault: true,
      writeFullEffect: true,
    })
    expect(resolve('setTransform: {} -transformFrom=default -writeDefault=false -ignoreDefault;', true)).toEqual({
      transformFrom: 'default',
      writeDefault: true,
      writeFullEffect: true,
    })
    expect(resolve('setTransform: {} -transformFrom=current -writeDefault;', true)).toEqual({
      transformFrom: 'current',
      writeDefault: false,
      writeFullEffect: false,
    })
  })

  it('新引擎下 default 与 parallel 组合成非完整写入', () => {
    expect(resolve('setTransform: {} -transformFrom=default -parallel;', true)).toEqual({
      transformFrom: 'default',
      writeDefault: true,
      writeFullEffect: false,
    })
  })

  it('transformFrom 的非 default 取值（含未知值与裸参数）一律解析为 current', () => {
    const expected: TransformWriteMode = {
      transformFrom: 'current',
      writeDefault: false,
      writeFullEffect: false,
    }

    expect(resolve('setTransform: {} -transformFrom=current;', true)).toEqual(expected)
    expect(resolve('setTransform: {} -transformFrom=bogus;', true)).toEqual(expected)
    expect(resolve('setTransform: {} -transformFrom;', true)).toEqual(expected)
  })

  it('新引擎下无参数默认 current 且不完整写入', () => {
    expect(resolve('setTransform: {};', true)).toEqual({
      transformFrom: 'current',
      writeDefault: false,
      writeFullEffect: false,
    })
  })

  it('新引擎下显式旧参数按 key 存在走旧分支，可表达非对角组合', () => {
    expect(resolve('setTransform: {} -writeDefault;', true)).toEqual({
      transformFrom: 'default',
      writeDefault: true,
      writeFullEffect: true,
    })
    expect(resolve('setTransform: {} -writeDefault -parallel;', true)).toEqual({
      transformFrom: 'default',
      writeDefault: true,
      writeFullEffect: false,
    })
    expect(resolve('setTransform: {} -writeDefault=false;', true)).toEqual({
      transformFrom: 'current',
      writeDefault: false,
      writeFullEffect: true,
    })
    expect(resolve('setTransform: {} -ignoreDefault=false;', true)).toEqual({
      transformFrom: 'current',
      writeDefault: false,
      writeFullEffect: true,
    })
    expect(resolve('setTransform: {} -ignoreDefault;', true)).toEqual({
      transformFrom: 'current',
      writeDefault: false,
      writeFullEffect: false,
    })
  })

  it('旧引擎完全忽略 transformFrom 并保持 4.6.4 的默认值', () => {
    expect(resolve('setTransform: {} -transformFrom=default;', false)).toEqual({
      transformFrom: 'current',
      writeDefault: false,
      writeFullEffect: true,
    })
    expect(resolve('setTransform: {} -transformFrom=current -writeDefault;', false)).toEqual({
      transformFrom: 'default',
      writeDefault: true,
      writeFullEffect: true,
    })
    expect(resolve('setTransform: {};', false)).toEqual({
      transformFrom: 'current',
      writeDefault: false,
      writeFullEffect: true,
    })
    expect(resolve('setTransform: {} -parallel;', false)).toEqual({
      transformFrom: 'current',
      writeDefault: false,
      writeFullEffect: false,
    })
    expect(resolve('setTransform: {} -ignoreDefault;', false)).toEqual({
      transformFrom: 'current',
      writeDefault: false,
      writeFullEffect: false,
    })
  })

  it('parallel 取自语句参数且沿用量值转换规则', () => {
    expect(resolve('setTransform: {} -transformFrom=default -parallel=1;', true)).toEqual({
      transformFrom: 'default',
      writeDefault: true,
      writeFullEffect: false,
    })
    expect(resolve('setTransform: {} -transformFrom=default -parallel=false;', true)).toEqual({
      transformFrom: 'default',
      writeDefault: true,
      writeFullEffect: true,
    })
  })
})
