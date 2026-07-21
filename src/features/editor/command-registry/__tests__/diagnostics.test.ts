import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { parseSentence } from '~/domain/script/parser'

import { querySentenceResourceReferences } from '../diagnostics'

describe('querySentenceResourceReferences', () => {
  it('从注册表字段读取内容资源引用', () => {
    const sentence = parseSentence('changeBg:chapter1/night.png;')
    expect(querySentenceResourceReferences(sentence!)).toEqual([{
      assetKey: { root: 'asset', assetType: 'background', relativePath: 'chapter1/night.png' },
      value: 'chapter1/night.png',
      source: { kind: 'content' },
    }])
  })

  it('从参数字段读取资源引用并忽略变量值', () => {
    const sentence = parseSentence('say:hello -vocal=voice/hello.ogg;')
    expect(querySentenceResourceReferences(sentence!)).toEqual([{
      assetKey: { root: 'asset', assetType: 'vocal', relativePath: 'voice/hello.ogg' },
      value: 'voice/hello.ogg',
      source: { kind: 'argument', key: 'vocal' },
    }])

    const variableSentence = parseSentence('say:hello -vocal={voice};')
    expect(querySentenceResourceReferences(variableSentence!)).toEqual([])
  })

  it('拆分 choose 内容中的每个场景文件', () => {
    const sentence = parseSentence('choose:First:chapter1/a.txt|Second:chapter1/b.txt;')
    expect(sentence?.command).toBe(commandType.choose)
    expect(querySentenceResourceReferences(sentence!)).toEqual([
      {
        assetKey: { root: 'scene', assetType: 'scene', relativePath: 'chapter1/a.txt' },
        value: 'chapter1/a.txt',
        source: { kind: 'choice', index: 0 },
      },
      {
        assetKey: { root: 'scene', assetType: 'scene', relativePath: 'chapter1/b.txt' },
        value: 'chapter1/b.txt',
        source: { kind: 'choice', index: 1 },
      },
    ])
  })
})
