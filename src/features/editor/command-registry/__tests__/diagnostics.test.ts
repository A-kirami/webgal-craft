import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { LATEST_ENGINE_RUNTIME_CAPABILITIES, LEGACY_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'
import { parseSentence } from '~/domain/script/parser'

import {
  findChangeFigureDiffCompatReferences,
  findColorFormatReferences,
  findSkippedFigureDiffModelReferences,
  findTransformWriteModeCompatReferences,
  findUnsupportedEngineModelReferences,
  findUnsupportedEngineOpusVocalReferences,
  querySentenceResourceReferences,
} from '../diagnostics'

describe('querySentenceResourceReferences', () => {
  it('从注册表字段读取内容资源引用', () => {
    const sentence = parseSentence('changeBg:chapter1/night.png;')
    expect(querySentenceResourceReferences(sentence!)).toEqual([{
      assetKey: { root: 'asset', assetType: 'background', relativePath: 'chapter1/night.png' },
      value: 'chapter1/night.png',
      source: { kind: 'content' },
    }])
  })

  it('把立绘差分的内容记为立绘引用', () => {
    const sentence = parseSentence('changeFigureDiff:smile.png -left -id=hero;')
    expect(sentence?.command).toBe(commandType.changeFigureDiff)
    expect(querySentenceResourceReferences(sentence!)).toEqual([{
      assetKey: { root: 'asset', assetType: 'figure', relativePath: 'smile.png' },
      value: 'smile.png',
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

  it('忽略与字面文本混写的变量取值', () => {
    const sentence = parseSentence('changeBg:chapter{n}/bg.png;')
    expect(querySentenceResourceReferences(sentence!)).toEqual([])
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

describe('findUnsupportedEngineOpusVocalReferences', () => {
  it('仅诊断旧引擎的 say Opus 语音参数', () => {
    expect(findUnsupportedEngineOpusVocalReferences(
      parseSentence('say:hello -voice.opus;')!,
      LEGACY_ENGINE_RUNTIME_CAPABILITIES,
    )).toEqual([{
      source: { kind: 'argument', key: 'vocal' },
      value: 'voice.opus',
    }])

    expect(findUnsupportedEngineOpusVocalReferences(
      parseSentence('say:hello -vocal=voice.opus;')!,
      LEGACY_ENGINE_RUNTIME_CAPABILITIES,
    )).toHaveLength(1)

    expect(findUnsupportedEngineOpusVocalReferences(
      parseSentence('bgm:theme.opus;')!,
      LEGACY_ENGINE_RUNTIME_CAPABILITIES,
    )).toEqual([])

    expect(findUnsupportedEngineOpusVocalReferences(
      parseSentence('say:hello -voice.opus;')!,
      LATEST_ENGINE_RUNTIME_CAPABILITIES,
    )).toEqual([])
  })

  it('跳过含变量插值的语音引用', () => {
    expect(findUnsupportedEngineOpusVocalReferences(
      parseSentence('say:hello -vocal=voices/{index}.opus;')!,
      LEGACY_ENGINE_RUNTIME_CAPABILITIES,
    )).toEqual([])

    expect(findUnsupportedEngineOpusVocalReferences(
      parseSentence('say:hello -vocal={voice};')!,
      LEGACY_ENGINE_RUNTIME_CAPABILITIES,
    )).toEqual([])
  })
})

describe('findTransformWriteModeCompatReferences', () => {
  it('旧引擎按 key 存在诊断语句里的 transformFrom', () => {
    expect(findTransformWriteModeCompatReferences(
      parseSentence('setTransform: {} -target=fig-center -transformFrom=default;')!,
      LEGACY_ENGINE_RUNTIME_CAPABILITIES,
    )).toEqual([{
      code: 'unsupported-transform-from',
      source: { kind: 'argument', key: 'transformFrom' },
      value: 'default',
    }])

    expect(findTransformWriteModeCompatReferences(
      parseSentence('setAnimation: bounce -transformFrom;')!,
      LEGACY_ENGINE_RUNTIME_CAPABILITIES,
    )).toEqual([{
      code: 'unsupported-transform-from',
      source: { kind: 'argument', key: 'transformFrom' },
      value: 'transformFrom',
    }])
  })

  it('旧引擎只诊断 resolveTransformArgs 的三个消费方', () => {
    expect(findTransformWriteModeCompatReferences(
      parseSentence('changeFigure: hero.png -transformFrom=default;')!,
      LEGACY_ENGINE_RUNTIME_CAPABILITIES,
    )).toEqual([])

    expect(findTransformWriteModeCompatReferences(
      parseSentence('setTempAnimation: {} -transformFrom=current;')!,
      LEGACY_ENGINE_RUNTIME_CAPABILITIES,
    )).toHaveLength(1)
  })

  it('新引擎诊断语句里遗留的旧写入参数', () => {
    expect(findTransformWriteModeCompatReferences(
      parseSentence('setTransform: {} -writeDefault -ignoreDefault=false -x=1;')!,
      LATEST_ENGINE_RUNTIME_CAPABILITIES,
    )).toEqual([
      {
        code: 'legacy-transform-write-arg',
        source: { kind: 'argument', key: 'writeDefault' },
        value: 'writeDefault',
        overriddenByTransformFrom: false,
      },
      {
        code: 'legacy-transform-write-arg',
        source: { kind: 'argument', key: 'ignoreDefault' },
        value: 'ignoreDefault',
        overriddenByTransformFrom: false,
      },
    ])

    expect(findTransformWriteModeCompatReferences(
      parseSentence('setTransform: {} -transformFrom=current;')!,
      LATEST_ENGINE_RUNTIME_CAPABILITIES,
    )).toEqual([])
  })

  it('同句已写 transformFrom 时旧写入参数标记为被当前引擎忽略', () => {
    expect(findTransformWriteModeCompatReferences(
      parseSentence('setTransform: {} -transformFrom=current -writeDefault -x=1;')!,
      LATEST_ENGINE_RUNTIME_CAPABILITIES,
    )).toEqual([{
      code: 'legacy-transform-write-arg',
      source: { kind: 'argument', key: 'writeDefault' },
      value: 'writeDefault',
      overriddenByTransformFrom: true,
    }])
  })

  it('新引擎不把 changeFigure 与 setTransition 的 ignoreDefault 当作写入模式残留', () => {
    expect(findTransformWriteModeCompatReferences(
      parseSentence('changeBg: bg.png -ignoreDefault;')!,
      LATEST_ENGINE_RUNTIME_CAPABILITIES,
    )).toEqual([])

    expect(findTransformWriteModeCompatReferences(
      parseSentence('setTransition: -target=fig-left -ignoreDefault;')!,
      LATEST_ENGINE_RUNTIME_CAPABILITIES,
    )).toEqual([])
  })
})

describe('findChangeFigureDiffCompatReferences', () => {
  it('旧引擎诊断语句里已有的立绘差分', () => {
    expect(findChangeFigureDiffCompatReferences(
      parseSentence('changeFigureDiff:smile.png -left -id=hero;')!,
      LEGACY_ENGINE_RUNTIME_CAPABILITIES,
    )).toEqual([{
      code: 'unsupported-change-figure-diff',
      source: { kind: 'content' },
      value: 'smile.png',
    }])
  })

  it('解析器不认识该命令时按 commandRaw 反查', () => {
    // 4.6.3 / 4.6.4：唯一会走退化路径的能力组合，此时命令名只留在 commandRaw 里
    const withoutChangeFigureDiff = { changeFigureDiff: false, sceneSemantics: true }
    const legacyParsed = parseSentence('changeFigureDiff:smile.png -left -id=hero;', withoutChangeFigureDiff)!

    expect(legacyParsed).toMatchObject({
      command: commandType.say,
      commandRaw: 'changeFigureDiff',
    })

    expect(findChangeFigureDiffCompatReferences(legacyParsed, withoutChangeFigureDiff))
      .toEqual([{
        code: 'unsupported-change-figure-diff',
        source: { kind: 'content' },
        value: 'smile.png',
      }])
  })

  it('普通对白不会被误判为立绘差分', () => {
    const capabilities = { changeFigureDiff: false, sceneSemantics: true }

    expect(findChangeFigureDiffCompatReferences(
      parseSentence('Alice: changeFigureDiff 是什么;', capabilities)!,
      capabilities,
    )).toEqual([])
    expect(findChangeFigureDiffCompatReferences(
      parseSentence('changeFigure:hero.png -left;', capabilities)!,
      capabilities,
    )).toEqual([])
  })

  it('新引擎不诊断', () => {
    expect(findChangeFigureDiffCompatReferences(
      parseSentence('changeFigureDiff:smile.png -left;', LATEST_ENGINE_RUNTIME_CAPABILITIES)!,
      LATEST_ENGINE_RUNTIME_CAPABILITIES,
    )).toEqual([])
  })
})

describe('findSkippedFigureDiffModelReferences', () => {
  it('识别立绘差分里引擎会跳过的 Live2D 与 Spine 内容', () => {
    expect(findSkippedFigureDiffModelReferences(
      parseSentence('changeFigureDiff:live2d/hero.json -id=hero;')!,
    )).toEqual([{
      code: 'skipped-figure-diff-model',
      modelType: 'live2d',
      source: { kind: 'content' },
      value: 'live2d/hero.json',
    }])

    expect(findSkippedFigureDiffModelReferences(
      parseSentence('changeFigureDiff:spine/hero.skel -left;')!,
    )).toEqual([{
      code: 'skipped-figure-diff-model',
      modelType: 'spine',
      source: { kind: 'content' },
      value: 'spine/hero.skel',
    }])
  })

  it('只看命令本身，与其他命令的模型内容无关', () => {
    expect(findSkippedFigureDiffModelReferences(parseSentence('changeFigure:hero.png -left;')!)).toEqual([])
    expect(findSkippedFigureDiffModelReferences(parseSentence('changeFigureDiff:smile.png -left;')!)).toEqual([])
  })

  it('跳过含变量插值的立绘差分内容', () => {
    expect(findSkippedFigureDiffModelReferences(
      parseSentence('changeFigureDiff:{model}.json -left;')!,
    )).toEqual([])
  })
})

describe('findUnsupportedEngineModelReferences', () => {
  it('跳过含变量插值的模型内容', () => {
    const capabilities = { live2d: false, spine: false }

    expect(findUnsupportedEngineModelReferences(
      parseSentence('changeFigure:live2d/{model}.json;')!,
      capabilities,
    )).toEqual([])

    expect(findUnsupportedEngineModelReferences(
      parseSentence('changeBg:spine/{model}.skel;')!,
      capabilities,
    )).toEqual([])
  })
})

describe('findColorFormatReferences', () => {
  it('跳过含变量插值的色值', () => {
    expect(findColorFormatReferences(parseSentence('intro: 你好 -fontColor={color};')!)).toEqual([])
    expect(findColorFormatReferences(parseSentence('intro: 你好 -fontColor=rgb({r}, 0, 0);')!)).toEqual([])
  })

  it('不含变量插值时照常分类', () => {
    expect(findColorFormatReferences(parseSentence('intro: 你好 -fontColor=#zzz;')!)).toEqual([{
      code: 'invalid-color-format',
      source: { kind: 'argument', key: 'fontColor' },
      value: '#zzz',
    }])
  })
})
