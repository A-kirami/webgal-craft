import { describe, expect, it } from 'vitest'

import {
  cloneGameConfigFormValues,
  createGameConfigSchema,
  parseGameConfigFormValues,
  serializeGameConfigEntries,
} from '../game-config-form'

import type { GameConfigFormValues } from '../game-config-form'
import type { GameConfigReadResult } from '~/commands/game'
import type { I18nT } from '~/utils/i18n-like'

const t = ((key: string) => key) as unknown as I18nT

function createFormValues(overrides: Partial<GameConfigFormValues> = {}): GameConfigFormValues {
  return {
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
    steamAppId: '',
    titleBgm: '',
    titleImg: '',
    ...overrides,
    customConfig: overrides.customConfig?.map(entry => ({ ...entry })) ?? [],
    gameLogo: overrides.gameLogo ? [...overrides.gameLogo] : [],
  }
}

function createReadResult(overrides: Partial<GameConfigReadResult> = {}): GameConfigReadResult {
  return {
    entries: [],
    unmanagedLineCount: 0,
    ...overrides,
  }
}

describe('gameConfigForm', () => {
  it('parseGameConfigFormValues 会把原始条目解析成表单可编辑值，并保留自定义项', () => {
    expect(parseGameConfigFormValues(createReadResult({
      entries: [
        {
          key: 'Default_Language',
          value: 'ja',
        },
        {
          key: 'Description',
          value: 'A visual novel',
        },
        {
          key: 'Enable_Appreciation',
          value: 'TRUE',
        },
        {
          key: 'Game_key',
          value: 'demo-key',
        },
        {
          key: 'Game_Logo',
          value: 'opening.webp|enter.webp|',
        },
        {
          key: 'Game_name',
          value: 'Demo',
        },
        {
          key: 'Legacy_Expression_Blend_Mode',
          value: 'false',
        },
        {
          key: 'Line_height',
          value: '2.5',
        },
        {
          key: 'Max_line',
          value: '4',
        },
        {
          key: 'Package_name',
          value: 'com.demo.game',
        },
        {
          key: 'Show_panic',
          value: 'false',
        },
        {
          key: 'Steam_AppID',
          value: '480',
        },
        {
          key: 'Title_bgm',
          value: 'title.ogg',
        },
        {
          key: 'Title_img',
          value: 'cover.webp',
        },
        {
          key: 'Stage_Width',
          value: '1920',
        },
        {
          key: 'Stage_Height',
          value: '1080',
        },
        {
          key: 'Custom_flag',
          value: 'enabled',
        },
      ],
    }))).toEqual(createFormValues({
      titleImg: 'cover.webp',
      defaultLanguage: 'ja',
      description: 'A visual novel',
      customConfig: [
        {
          key: 'Stage_Width',
          value: '1920',
        },
        {
          key: 'Stage_Height',
          value: '1080',
        },
        {
          key: 'Custom_flag',
          value: 'enabled',
        },
      ],
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
    }))
  })

  it('parseGameConfigFormValues 会为无效值回退到编辑器默认值', () => {
    expect(parseGameConfigFormValues(createReadResult({
      entries: [
        {
          key: 'Default_Language',
          value: 'ko',
        },
        {
          key: 'Enable_Appreciation',
          value: 'unexpected',
        },
        {
          key: 'Line_height',
          value: '0',
        },
        {
          key: 'Max_line',
          value: '2.5',
        },
        {
          key: 'Line_height',
          value: 'not-a-number',
        },
        {
          key: 'Max_line',
          value: '-1',
        },
      ],
      unmanagedLineCount: 2,
    }))).toEqual(createFormValues({
      gameName: '',
    }))
  })

  it('cloneGameConfigFormValues 会深拷贝数组字段', () => {
    const original = createFormValues({
      customConfig: [
        {
          key: 'Custom_flag',
          value: 'enabled',
        },
      ],
      gameLogo: ['opening.webp'],
    })

    const cloned = cloneGameConfigFormValues(original)
    cloned.customConfig[0]!.key = 'Changed_flag'
    cloned.gameLogo.push('ending.webp')

    expect(original).toEqual(createFormValues({
      customConfig: [
        {
          key: 'Custom_flag',
          value: 'enabled',
        },
      ],
      gameLogo: ['opening.webp'],
    }))
  })

  it('createGameConfigSchema 会拒绝不支持的默认语言', () => {
    const schema = createGameConfigSchema(t)

    expect(schema.safeParse({
      ...createFormValues(),
      defaultLanguage: 'ko',
    }).success).toBe(false)
  })

  it('createGameConfigSchema 会拒绝空白游戏名称', () => {
    const schema = createGameConfigSchema(t)

    expect(schema.safeParse(createFormValues({
      gameName: '',
    })).success).toBe(false)

    expect(schema.safeParse(createFormValues({
      gameName: '   ',
    })).success).toBe(false)
  })

  it('createGameConfigSchema 会校验并裁剪包名', () => {
    const schema = createGameConfigSchema(t)

    expect(schema.safeParse(createFormValues({
      packageName: 'org.example_demo',
    })).success).toBe(false)
    expect(schema.safeParse(createFormValues({
      packageName: 'Demo.App',
    })).success).toBe(false)

    const result = schema.parse(createFormValues({
      packageName: '  org.example.demo  ',
    }))

    expect(result.packageName).toBe('org.example.demo')
  })

  it('createGameConfigSchema 会校验并裁剪 Steam AppID', () => {
    const schema = createGameConfigSchema(t)

    expect(schema.safeParse(createFormValues({
      steamAppId: 'abc',
    })).success).toBe(false)
    expect(schema.safeParse(createFormValues({
      steamAppId: '0',
    })).success).toBe(false)
    expect(schema.safeParse(createFormValues({
      steamAppId: '4294967296',
    })).success).toBe(false)

    const result = schema.parse(createFormValues({
      steamAppId: '  480  ',
    }))

    expect(result.steamAppId).toBe('480')
  })

  it('createGameConfigSchema 会拒绝和内置 raw key 重名的自定义项', () => {
    const schema = createGameConfigSchema(t)

    expect(schema.safeParse(createFormValues({
      customConfig: [
        {
          key: 'Game_name',
          value: 'Demo',
        },
      ],
    })).success).toBe(false)
  })

  it('createGameConfigSchema 会拒绝带首尾空格的自定义键，并按去空格后的结果识别内置键', () => {
    const schema = createGameConfigSchema(t)
    const result = schema.safeParse(createFormValues({
      customConfig: [
        {
          key: ' Game_name ',
          value: 'Demo',
        },
      ],
    }))

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map(issue => issue.message)).toEqual(expect.arrayContaining([
        'modals.gameConfig.validation.customConfigKeyNoSurroundingWhitespace',
        'modals.gameConfig.validation.customConfigKeyReserved',
      ]))
    }
  })

  it('createGameConfigSchema 允许 Stage_Width 和 Stage_Height 作为自定义项', () => {
    const schema = createGameConfigSchema(t)

    expect(schema.safeParse(createFormValues({
      customConfig: [
        {
          key: 'Stage_Width',
          value: '1920',
        },
        {
          key: 'Stage_Height',
          value: '1080',
        },
      ],
    })).success).toBe(true)
  })

  it('createGameConfigSchema 会拒绝重复的自定义键', () => {
    const schema = createGameConfigSchema(t)

    expect(schema.safeParse(createFormValues({
      customConfig: [
        {
          key: 'Custom_flag',
          value: 'a',
        },
        {
          key: 'Custom_flag',
          value: 'b',
        },
      ],
    })).success).toBe(false)
  })

  it('createGameConfigSchema 会按去空格后的结果拒绝重复的自定义键', () => {
    const schema = createGameConfigSchema(t)
    const result = schema.safeParse(createFormValues({
      customConfig: [
        {
          key: 'Custom_flag',
          value: 'a',
        },
        {
          key: ' Custom_flag ',
          value: 'b',
        },
      ],
    }))

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map(issue => issue.message)).toEqual(expect.arrayContaining([
        'modals.gameConfig.validation.customConfigKeyNoSurroundingWhitespace',
        'modals.gameConfig.validation.customConfigKeyDuplicate',
      ]))
    }
  })

  it('createGameConfigSchema 会拒绝包含分号的内置字符串字段', () => {
    const schema = createGameConfigSchema(t)

    expect(schema.safeParse(createFormValues({
      gameName: 'Demo;Broken',
    })).success).toBe(false)

    expect(schema.safeParse(createFormValues({
      description: 'Intro;Comment',
    })).success).toBe(false)
  })

  it('createGameConfigSchema 会拒绝包含分号的自定义键和值', () => {
    const schema = createGameConfigSchema(t)

    expect(schema.safeParse(createFormValues({
      customConfig: [
        {
          key: 'Custom;Flag',
          value: 'enabled',
        },
      ],
    })).success).toBe(false)

    expect(schema.safeParse(createFormValues({
      customConfig: [
        {
          key: 'Custom_flag',
          value: 'enabled;comment',
        },
      ],
    })).success).toBe(false)
  })

  it('createGameConfigSchema 会忽略键和值都为空的自定义行', () => {
    const schema = createGameConfigSchema(t)

    expect(schema.safeParse(createFormValues({
      customConfig: [
        {
          key: '',
          value: '',
        },
        {
          key: '   ',
          value: '',
        },
        {
          key: 'Custom_flag',
          value: '',
        },
      ],
    })).success).toBe(true)
  })

  it('serializeGameConfigEntries 会输出统一 raw entries，并保留自定义配置项', () => {
    expect(serializeGameConfigEntries(createFormValues({
      titleImg: 'cover.webp',
      description: 'A visual novel',
      customConfig: [
        {
          key: 'Stage_Width',
          value: '1920',
        },
        {
          key: 'Stage_Height',
          value: '1080',
        },
        {
          key: 'Custom_flag',
          value: 'enabled',
        },
      ],
      enableAppreciation: true,
      gameKey: 'demo-key',
      packageName: 'com.demo.game',
      gameLogo: ['opening.webp', 'enter.webp'],
      steamAppId: '',
      titleBgm: 'title.ogg',
    }))).toEqual({
      entries: [
        {
          key: 'Game_name',
          value: 'Demo',
        },
        {
          key: 'Description',
          value: 'A visual novel',
        },
        {
          key: 'Title_img',
          value: 'cover.webp',
        },
        {
          key: 'Title_bgm',
          value: 'title.ogg',
        },
        {
          key: 'Game_Logo',
          value: 'opening.webp|enter.webp|',
        },
        {
          key: 'Enable_Appreciation',
          value: 'true',
        },
        {
          key: 'Legacy_Expression_Blend_Mode',
          value: 'false',
        },
        {
          key: 'Show_panic',
          value: 'true',
        },
        {
          key: 'Package_name',
          value: 'com.demo.game',
        },
        {
          key: 'Game_key',
          value: 'demo-key',
        },
        {
          key: 'Stage_Width',
          value: '1920',
        },
        {
          key: 'Stage_Height',
          value: '1080',
        },
        {
          key: 'Custom_flag',
          value: 'enabled',
        },
      ],
    })
  })

  it('serializeGameConfigEntries 会省略为空的可选 built-in 字段，但保留空字符串自定义值', () => {
    expect(serializeGameConfigEntries(createFormValues({
      defaultLanguage: '',
      description: '',
      gameKey: '',
      gameName: '',
      gameLogo: [],
      lineHeight: '',
      maxLine: '',
      packageName: '',
      steamAppId: '',
      titleBgm: '',
      titleImg: '',
      legacyExpressionBlendMode: true,
      showPanic: false,
      customConfig: [
        {
          key: '',
          value: '',
        },
        {
          key: '   ',
          value: '',
        },
        {
          key: 'Custom_flag',
          value: '',
        },
      ],
    }))).toEqual({
      entries: [
        {
          key: 'Enable_Appreciation',
          value: 'false',
        },
        {
          key: 'Legacy_Expression_Blend_Mode',
          value: 'true',
        },
        {
          key: 'Show_panic',
          value: 'false',
        },
        {
          key: 'Custom_flag',
          value: '',
        },
      ],
    })
  })
})
