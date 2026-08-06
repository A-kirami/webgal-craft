import { describe, expect, it } from 'vitest'

import { LATEST_ENGINE_RUNTIME_CAPABILITIES, LEGACY_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'
import { parseSentence } from '~/domain/script/parser'

import { diagnoseEditorDocument } from '../document-diagnostics'
import { diagnoseScene } from '../scene-diagnostics'

describe('diagnoseScene', () => {
  it('同时返回重复标签、缺失跳转目标和缺失资源诊断', () => {
    const sentences = [
      parseSentence('label:start;'),
      parseSentence('changeBg:missing.png;'),
      parseSentence('label: start;'),
      parseSentence('jumpLabel:missing;'),
    ]

    expect(diagnoseScene(sentences, {
      hasAssetKey: () => false,
    })).toEqual([
      {
        code: 'duplicate-label',
        count: 2,
        field: { kind: 'content' },
        label: 'start',
        severity: 'warning',
        source: 'scene',
        statementIndex: 0,
      },
      {
        assetKey: {
          assetType: 'background',
          relativePath: 'missing.png',
          root: 'asset',
        },
        code: 'missing-resource',
        field: { kind: 'content' },
        severity: 'error',
        source: 'resource',
        statementIndex: 1,
        value: 'missing.png',
      },
      {
        code: 'duplicate-label',
        count: 2,
        field: { kind: 'content' },
        label: 'start',
        severity: 'warning',
        source: 'scene',
        statementIndex: 2,
      },
      {
        code: 'missing-label',
        field: { kind: 'content' },
        label: 'missing',
        severity: 'error',
        source: 'scene',
        statementIndex: 3,
      },
    ])
  })

  it('未提供资源查询能力时只执行场景语义诊断', () => {
    const sentences = [
      parseSentence('changeBg:missing.png;'),
      parseSentence('label:start;'),
      parseSentence('label:start;'),
    ]

    expect(diagnoseScene(sentences)).toEqual([
      expect.objectContaining({
        code: 'duplicate-label',
        statementIndex: 1,
      }),
      expect.objectContaining({
        code: 'duplicate-label',
        statementIndex: 2,
      }),
    ])
  })

  it('根据引擎能力诊断 Live2D 与 Spine 模型引用', () => {
    const sentences = [
      parseSentence('changeFigure:live2d/hero.json;'),
      parseSentence('changeFigure:spine/hero.json?type=spine;'),
      parseSentence('changeFigure:spine/hero.skel;'),
      parseSentence('changeFigure:images/hero.png;'),
      parseSentence('changeAnimation:opening.json;'),
      parseSentence('unlockCg:gallery/model.skel;'),
      parseSentence('miniAvatar:avatar.json;'),
    ]

    expect(diagnoseScene(sentences, {
      engineCapabilities: { live2d: true, spine: false },
    })).toEqual([
      {
        code: 'unsupported-spine',
        field: { kind: 'content' },
        severity: 'warning',
        source: 'engine',
        statementIndex: 1,
        value: 'spine/hero.json?type=spine',
      },
      {
        code: 'unsupported-spine',
        field: { kind: 'content' },
        severity: 'warning',
        source: 'engine',
        statementIndex: 2,
        value: 'spine/hero.skel',
      },
    ])
  })

  it('仅将 .skel 背景作为 Spine 模型诊断', () => {
    const sentences = [
      parseSentence('changeBg:live2d/background.json;'),
      parseSentence('changeBg:spine/background.json?type=spine;'),
      parseSentence('changeBg:spine/background.SKEL;'),
      parseSentence('changeBg:spine/background.skel?version=1;'),
      parseSentence('changeBg:images/background.png -enter=transitions/fade.json -exit=transitions/fade.skel;'),
    ]

    expect(diagnoseScene(sentences, {
      engineCapabilities: { live2d: false, spine: false },
    })).toEqual([
      {
        code: 'unsupported-spine',
        field: { kind: 'content' },
        severity: 'warning',
        source: 'engine',
        statementIndex: 2,
        value: 'spine/background.SKEL',
      },
    ])
  })

  it('没有可用的引擎能力上下文时不生成兼容性诊断', () => {
    expect(diagnoseScene([
      parseSentence('changeFigure:live2d/hero.json;'),
      parseSentence('changeFigure:spine/hero.skel;'),
    ])).toEqual([])
  })

  it('为旧引擎的 say Opus 语音引用生成警告', () => {
    const sentences = [
      parseSentence('say:hello -voice.opus;'),
      parseSentence('say:world -vocal=voice.ogg;'),
      parseSentence('bgm:theme.opus;'),
    ]

    expect(diagnoseScene(sentences, {
      runtimeCapabilities: LEGACY_ENGINE_RUNTIME_CAPABILITIES,
    })).toEqual([{
      code: 'unsupported-opus-vocal',
      field: { kind: 'argument', key: 'vocal' },
      severity: 'warning',
      source: 'engine',
      statementIndex: 0,
      value: 'voice.opus',
    }])

    expect(diagnoseScene(sentences, {
      runtimeCapabilities: LATEST_ENGINE_RUNTIME_CAPABILITIES,
    })).toEqual([])
  })
})

describe('diagnoseEditorDocument', () => {
  it('非法动画文本会生成文档级错误', () => {
    expect(diagnoseEditorDocument({
      textProjection: {
        kind: 'animation',
        syncError: 'invalid-animation-json',
      },
    })).toEqual([{
      code: 'invalid-animation-json',
      severity: 'error',
      source: 'document',
    }])
  })
})
