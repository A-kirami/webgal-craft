import { describe, expect, it } from 'vitest'

import {
  createGameConfigSchema,
  parseGameConfigFormValues,
  serializeGameConfigPatch,
} from '../game-config-form'

import type { I18nT } from '~/utils/i18n-like'

const t = ((key: string) => key) as unknown as I18nT

describe('game-config form helpers', () => {
  it('parseGameConfigFormValues 会把原始配置解析成表单可编辑值', () => {
    expect(parseGameConfigFormValues({
      defaultLanguage: 'ja',
      description: 'A visual novel',
      enableAppreciation: 'TRUE',
      gameKey: 'demo-key',
      gameLogo: 'opening.webp|enter.webp|',
      gameName: 'Demo',
      legacyExpressionBlendMode: 'false',
      lineHeight: '2.5',
      maxLine: '4',
      packageName: 'com.demo.game',
      showPanic: 'false',
      steamAppId: '480',
      titleBgm: 'title.ogg',
      titleImg: 'cover.webp',
    })).toEqual({
      titleImg: 'cover.webp',
      defaultLanguage: 'ja',
      description: 'A visual novel',
      enableAppreciation: true,
      gameKey: 'demo-key',
      gameName: 'Demo',
      legacyExpressionBlendMode: false,
      lineHeight: 2.5,
      maxLine: 4,
      packageName: 'com.demo.game',
      showPanic: false,
      gameLogo: ['opening.webp', 'enter.webp'],
      steamAppId: '480',
      titleBgm: 'title.ogg',
    })
  })

  it('parseGameConfigFormValues 会为无效值回退到编辑器默认值', () => {
    expect(parseGameConfigFormValues({
      defaultLanguage: 'ko',
      enableAppreciation: 'unexpected',
      legacyExpressionBlendMode: undefined,
      lineHeight: '',
      maxLine: 'not-a-number',
      showPanic: undefined,
    })).toEqual({
      titleImg: '',
      defaultLanguage: '',
      description: '',
      enableAppreciation: false,
      gameKey: '',
      gameName: '',
      legacyExpressionBlendMode: false,
      lineHeight: '',
      maxLine: '',
      packageName: '',
      showPanic: true,
      gameLogo: [],
      steamAppId: '',
      titleBgm: '',
    })
  })

  it('createGameConfigSchema 会拒绝不支持的默认语言', () => {
    const schema = createGameConfigSchema(t)

    expect(schema.safeParse({
      titleImg: '',
      defaultLanguage: 'ko',
      description: '',
      enableAppreciation: false,
      gameKey: '',
      gameName: '',
      legacyExpressionBlendMode: false,
      lineHeight: '',
      maxLine: '',
      packageName: '',
      showPanic: true,
      gameLogo: [],
      steamAppId: '',
      titleBgm: '',
    }).success).toBe(false)
  })

  it('createGameConfigSchema 会拒绝空白游戏名称', () => {
    const schema = createGameConfigSchema(t)

    expect(schema.safeParse({
      titleImg: '',
      defaultLanguage: '',
      description: '',
      enableAppreciation: false,
      gameKey: '',
      gameName: '',
      legacyExpressionBlendMode: false,
      lineHeight: '',
      maxLine: '',
      packageName: '',
      showPanic: true,
      gameLogo: [],
      steamAppId: '',
      titleBgm: '',
    }).success).toBe(false)

    expect(schema.safeParse({
      titleImg: '',
      defaultLanguage: '',
      description: '',
      enableAppreciation: false,
      gameKey: '',
      gameName: '   ',
      legacyExpressionBlendMode: false,
      lineHeight: '',
      maxLine: '',
      packageName: '',
      showPanic: true,
      gameLogo: [],
      steamAppId: '',
      titleBgm: '',
    }).success).toBe(false)
  })

  it('createGameConfigSchema 会拒绝明显无效的跨平台包名', () => {
    const schema = createGameConfigSchema(t)

    expect(schema.safeParse({
      titleImg: '',
      defaultLanguage: '',
      description: '',
      enableAppreciation: false,
      gameKey: '',
      gameName: '',
      legacyExpressionBlendMode: false,
      lineHeight: '',
      maxLine: '',
      packageName: 'org.example_demo',
      showPanic: true,
      gameLogo: [],
      steamAppId: '',
      titleBgm: '',
    }).success).toBe(false)

    expect(schema.safeParse({
      titleImg: '',
      defaultLanguage: '',
      description: '',
      enableAppreciation: false,
      gameKey: '',
      gameName: '',
      legacyExpressionBlendMode: false,
      lineHeight: '',
      maxLine: '',
      packageName: 'Demo.App',
      showPanic: true,
      gameLogo: [],
      steamAppId: '',
      titleBgm: '',
    }).success).toBe(false)
  })

  it('createGameConfigSchema 会把包名前后空白裁剪后再校验', () => {
    const schema = createGameConfigSchema(t)

    const result = schema.parse({
      titleImg: '',
      defaultLanguage: '',
      description: '',
      enableAppreciation: false,
      gameKey: '',
      gameName: 'Demo',
      legacyExpressionBlendMode: false,
      lineHeight: '',
      maxLine: '',
      packageName: '  org.example.demo  ',
      showPanic: true,
      gameLogo: [],
      steamAppId: '',
      titleBgm: '',
    })

    expect(result.packageName).toBe('org.example.demo')
  })

  it('createGameConfigSchema 会拒绝无效的 Steam AppID', () => {
    const schema = createGameConfigSchema(t)

    expect(schema.safeParse({
      titleImg: '',
      defaultLanguage: '',
      description: '',
      enableAppreciation: false,
      gameKey: '',
      gameName: '',
      legacyExpressionBlendMode: false,
      lineHeight: '',
      maxLine: '',
      packageName: '',
      showPanic: true,
      gameLogo: [],
      steamAppId: 'abc',
      titleBgm: '',
    }).success).toBe(false)

    expect(schema.safeParse({
      titleImg: '',
      defaultLanguage: '',
      description: '',
      enableAppreciation: false,
      gameKey: '',
      gameName: '',
      legacyExpressionBlendMode: false,
      lineHeight: '',
      maxLine: '',
      packageName: '',
      showPanic: true,
      gameLogo: [],
      steamAppId: '0',
      titleBgm: '',
    }).success).toBe(false)

    expect(schema.safeParse({
      titleImg: '',
      defaultLanguage: '',
      description: '',
      enableAppreciation: false,
      gameKey: '',
      gameName: '',
      legacyExpressionBlendMode: false,
      lineHeight: '',
      maxLine: '',
      packageName: '',
      showPanic: true,
      gameLogo: [],
      steamAppId: '4294967296',
      titleBgm: '',
    }).success).toBe(false)
  })

  it('createGameConfigSchema 会把 Steam AppID 前后空白裁剪后再校验', () => {
    const schema = createGameConfigSchema(t)

    const result = schema.parse({
      titleImg: '',
      defaultLanguage: '',
      description: '',
      enableAppreciation: false,
      gameKey: '',
      gameName: 'Demo',
      legacyExpressionBlendMode: false,
      lineHeight: '',
      maxLine: '',
      packageName: '',
      showPanic: true,
      gameLogo: [],
      steamAppId: '  480  ',
      titleBgm: '',
    })

    expect(result.steamAppId).toBe('480')
  })

  it('serializeGameConfigPatch 会把可选回退字段序列化为删除补丁', () => {
    expect(serializeGameConfigPatch({
      titleImg: 'cover.webp',
      defaultLanguage: '',
      description: 'A visual novel',
      enableAppreciation: true,
      gameKey: 'demo-key',
      gameName: 'Demo',
      legacyExpressionBlendMode: false,
      lineHeight: '',
      maxLine: '',
      packageName: 'com.demo.game',
      showPanic: true,
      gameLogo: ['opening.webp', 'enter.webp'],
      steamAppId: '',
      titleBgm: 'title.ogg',
    })).toEqual({
      set: {
        description: 'A visual novel',
        enableAppreciation: 'true',
        gameKey: 'demo-key',
        gameLogo: 'opening.webp|enter.webp|',
        gameName: 'Demo',
        legacyExpressionBlendMode: 'false',
        packageName: 'com.demo.game',
        showPanic: 'true',
        titleBgm: 'title.ogg',
        titleImg: 'cover.webp',
      },
      unset: ['defaultLanguage', 'lineHeight', 'maxLine', 'steamAppId'],
    })
  })

  it('serializeGameConfigPatch 会把非开关空字段序列化为删除补丁', () => {
    expect(serializeGameConfigPatch({
      titleImg: '',
      defaultLanguage: '',
      description: '',
      enableAppreciation: false,
      gameKey: '',
      gameName: '',
      legacyExpressionBlendMode: true,
      lineHeight: '',
      maxLine: '',
      packageName: '',
      showPanic: false,
      gameLogo: [],
      steamAppId: '',
      titleBgm: '',
    })).toEqual({
      set: {
        enableAppreciation: 'false',
        legacyExpressionBlendMode: 'true',
        showPanic: 'false',
      },
      unset: [
        'defaultLanguage',
        'description',
        'gameKey',
        'gameName',
        'gameLogo',
        'lineHeight',
        'maxLine',
        'packageName',
        'steamAppId',
        'titleBgm',
        'titleImg',
      ],
    })
  })
})
