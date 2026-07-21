import { describe, expect, it } from 'vitest'

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
