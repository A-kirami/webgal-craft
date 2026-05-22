import { describe, expect, it } from 'vitest'

import { resolvePreviewReadySyncTarget } from '../preview-ready-sync-target'

describe('预览就绪同步目标解析', () => {
  it('无场景文件时不会生成初始 sync-scene 目标', () => {
    expect(resolvePreviewReadySyncTarget({
      activeDocumentKind: undefined,
      activeDocumentPath: undefined,
      selectedLineNumber: undefined,
      textContent: undefined,
    })).toBeUndefined()
  })

  it('场景文件无光标时回落到第一行', () => {
    expect(resolvePreviewReadySyncTarget({
      activeDocumentKind: 'scene',
      activeDocumentPath: '/games/demo/scene/start.txt',
      selectedLineNumber: undefined,
      textContent: 'first line\nsecond line',
    })).toEqual({
      path: '/games/demo/scene/start.txt',
      lineNumber: 1,
      lineText: 'first line',
    })
  })

  it('场景文件有光标时使用当前行', () => {
    expect(resolvePreviewReadySyncTarget({
      activeDocumentKind: 'scene',
      activeDocumentPath: '/games/demo/scene/start.txt',
      selectedLineNumber: 2,
      textContent: 'first line\nsecond line',
    })).toEqual({
      path: '/games/demo/scene/start.txt',
      lineNumber: 2,
      lineText: 'second line',
    })
  })

  it('超出范围的行号会回落到第一行', () => {
    expect(resolvePreviewReadySyncTarget({
      activeDocumentKind: 'scene',
      activeDocumentPath: '/games/demo/scene/start.txt',
      selectedLineNumber: 99,
      textContent: 'first line\nsecond line',
    })).toEqual({
      path: '/games/demo/scene/start.txt',
      lineNumber: 1,
      lineText: 'first line',
    })
  })
})
