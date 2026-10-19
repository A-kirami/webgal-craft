import { describe, expect, it } from 'vitest'

import {
  detectAnimationDocumentFormat,
  isAnimationDocumentTextValid,
  parseAnimationDocument,
  serializeAnimationFrames,
} from '../animation-document-codec'

describe('动画文档编解码', () => {
  it('解析和序列化 v1 animation 文档使用统一格式', () => {
    const frames = [{
      duration: 200,
      ease: 'linear',
      position: { x: 12, y: 34 },
    }]

    const content = serializeAnimationFrames(frames)

    expect(content).toBe([
      '[',
      '  {',
      '    "duration": 200,',
      '    "ease": "linear",',
      '    "position": {',
      '      "x": 12,',
      '      "y": 34',
      '    }',
      '  }',
      ']',
    ].join('\n'))
    expect(parseAnimationDocument(content)).toEqual(frames)
  })

  it('按顶层结构区分 v1 关键帧数组与 v2 对象', () => {
    expect(detectAnimationDocumentFormat('')).toBe('v1-frames')
    expect(detectAnimationDocumentFormat('[]')).toBe('v1-frames')
    expect(detectAnimationDocumentFormat('[{"duration":100}]')).toBe('v1-frames')
    expect(detectAnimationDocumentFormat('{"duration":200}')).toBe('v2-object')
    expect(detectAnimationDocumentFormat(JSON.stringify({
      keyframes: [{ time: 0, alpha: 0 }],
      relative: true,
      version: 2,
    }))).toBe('v2-object')
    expect(detectAnimationDocumentFormat(JSON.stringify({
      keyframes: [{ duration: 100 }],
      version: 1,
    }))).toBe('v2-object')
  })

  it('v1 关键帧数组与 v2 对象都判定为有效动画文本', () => {
    expect(isAnimationDocumentTextValid('[]')).toBe(true)
    expect(isAnimationDocumentTextValid('[{"duration":100}]')).toBe(true)
    expect(isAnimationDocumentTextValid('{"version":2,"keyframes":[]}')).toBe(true)
    expect(isAnimationDocumentTextValid('{"version":1,"keyframes":[{"duration":100}]}')).toBe(true)
  })

  it.each([
    { content: '{', label: '非法 JSON' },
    { content: '"animation"', label: '字符串' },
    { content: '42', label: '数字' },
    { content: 'true', label: '布尔值' },
    { content: 'null', label: 'null' },
  ])('$label 不会被判定为合法 animation 文本', ({ content }) => {
    expect(isAnimationDocumentTextValid(content)).toBe(false)
    expect(() => detectAnimationDocumentFormat(content)).toThrow()
  })

  it('parseAnimationDocument 仍然只接受 v1 关键帧数组', () => {
    expect(() => parseAnimationDocument('{"duration":200}')).toThrow('动画文档必须是 JSON 数组')
    expect(() => parseAnimationDocument('{"version":2,"keyframes":[]}')).toThrow('动画文档必须是 JSON 数组')
  })
})
