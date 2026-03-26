import { describe, expect, it } from 'vitest'

import {
  isAnimationDocumentTextValid,
  parseAnimationDocument,
  serializeAnimationFrames,
} from '../animation-document-codec'

describe('动画文档编解码', () => {
  it('解析和序列化 animation 文档使用统一格式', () => {
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

  it('无效 JSON 不会被判定为合法 animation 文本', () => {
    expect(isAnimationDocumentTextValid('{')).toBe(false)
    expect(() => parseAnimationDocument('{')).toThrow()
  })

  it('只有 JSON 数组才会被接受为 animation 文档', () => {
    expect(isAnimationDocumentTextValid('{"duration":200}')).toBe(false)
    expect(() => parseAnimationDocument('{"duration":200}')).toThrow('动画文档必须是 JSON 数组')
  })
})
