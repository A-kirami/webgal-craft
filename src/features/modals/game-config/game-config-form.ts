import * as z from 'zod'

import { BUILT_IN_GAME_CONFIG_RAW_KEYS } from '~/commands/game'

import { parseGameLogoImages, serializeGameLogoImages } from './game-config-images'

import type {
  GameConfigEntry,
  GameConfigReadResult,
  GameConfigWritePayload,
} from '~/commands/game'
import type { I18nT } from '~/utils/i18n-like'

export const GAME_CONFIG_DEFAULT_LANGUAGES = [
  'zh_CN',
  'zh_TW',
  'en',
  'ja',
  'fr',
  'de',
] as const

export type GameConfigDefaultLanguage = (typeof GAME_CONFIG_DEFAULT_LANGUAGES)[number]

const BUILT_IN_GAME_CONFIG_RAW_KEY_SET: ReadonlySet<string> = new Set(BUILT_IN_GAME_CONFIG_RAW_KEYS)

export interface GameConfigFormValues {
  customConfig: GameConfigEntry[]
  defaultLanguage: '' | GameConfigDefaultLanguage
  description: string
  enableAppreciation: boolean
  gameKey: string
  gameName: string
  gameLogo: string[]
  legacyExpressionBlendMode: boolean
  lineHeight: '' | number
  maxLine: '' | number
  packageName: string
  showPanic: boolean
  steamAppId: string
  titleBgm: string
  titleImg: string
}

const EMPTY_GAME_CONFIG_FORM_VALUES = {
  customConfig: [],
  defaultLanguage: '',
  description: '',
  enableAppreciation: false,
  gameKey: '',
  gameName: '',
  gameLogo: [],
  legacyExpressionBlendMode: false,
  lineHeight: '',
  maxLine: '',
  packageName: '',
  showPanic: true,
  steamAppId: '',
  titleBgm: '',
  titleImg: '',
} satisfies GameConfigFormValues

function cloneGameConfigEntries(entries: readonly GameConfigEntry[]): GameConfigEntry[] {
  return entries.map(entry => ({ ...entry }))
}

function isPositiveFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

function createOptionalPositiveIntegerSchema(t: I18nT) {
  return z.literal('').or(z.number()).refine(
    value => value === '' || isPositiveInteger(value),
    { error: t('modals.gameConfig.validation.maxLineInvalid') },
  ) satisfies z.ZodType<'' | number>
}

function createRequiredGameNameSchema(t: I18nT) {
  return createConfigValueSchema(t)
    .trim()
    .min(1, { error: t('modals.gameConfig.validation.gameNameRequired') })
}

function createOptionalPositiveNumberSchema(t: I18nT) {
  return z.literal('').or(z.number()).refine(
    value => value === '' || isPositiveFiniteNumber(value),
    { error: t('modals.gameConfig.validation.lineHeightInvalid') },
  ) satisfies z.ZodType<'' | number>
}

function createOptionalPackageNameSchema(t: I18nT) {
  return z.string().trim().refine(
    value => value === '' || /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(value),
    { error: t('modals.gameConfig.validation.packageNameInvalid') },
  )
}

function createOptionalSteamAppIdSchema(t: I18nT) {
  return z.string().trim().refine(
    (value) => {
      if (value === '') {
        return true
      }

      if (!/^\d+$/.test(value)) {
        return false
      }

      const numericValue = BigInt(value)
      return numericValue >= 1n && numericValue <= 42_9496_7295n
    },
    { error: t('modals.gameConfig.validation.steamAppIdInvalid') },
  )
}

function hasLineBreak(value: string): boolean {
  return /\r\n?|\n/.test(value)
}

function hasSemicolon(value: string): boolean {
  return value.includes(';')
}

function normalizeCustomConfigKey(key: string): string {
  return key.trim()
}

function createConfigValueSchema(t: I18nT) {
  return z.string().refine(
    value => !hasSemicolon(value),
    { error: t('modals.gameConfig.validation.configValueNoSemicolon') },
  )
}

function isBlankCustomConfigEntry(entry: Pick<GameConfigEntry, 'key' | 'value'>): boolean {
  return normalizeCustomConfigKey(entry.key) === '' && entry.value === ''
}

function createCustomConfigEntrySchema(t: I18nT) {
  return z.object({
    key: z.string(),
    value: createConfigValueSchema(t)
      .refine(
        value => !hasLineBreak(value),
        { error: t('modals.gameConfig.validation.customConfigValueSingleLine') },
      ),
  }).superRefine((entry, ctx) => {
    const normalizedKey = normalizeCustomConfigKey(entry.key)

    if (isBlankCustomConfigEntry(entry)) {
      return
    }

    if (normalizedKey.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: t('modals.gameConfig.validation.customConfigKeyRequired'),
        path: ['key'],
      })
      return
    }

    if (entry.key !== normalizedKey) {
      ctx.addIssue({
        code: 'custom',
        message: t('modals.gameConfig.validation.customConfigKeyNoSurroundingWhitespace'),
        path: ['key'],
      })
    }

    if (hasLineBreak(entry.key)) {
      ctx.addIssue({
        code: 'custom',
        message: t('modals.gameConfig.validation.customConfigKeySingleLine'),
        path: ['key'],
      })
    }

    if (entry.key.includes(':')) {
      ctx.addIssue({
        code: 'custom',
        message: t('modals.gameConfig.validation.customConfigKeyNoColon'),
        path: ['key'],
      })
    }

    if (hasSemicolon(entry.key)) {
      ctx.addIssue({
        code: 'custom',
        message: t('modals.gameConfig.validation.customConfigKeyNoSemicolon'),
        path: ['key'],
      })
    }

    if (BUILT_IN_GAME_CONFIG_RAW_KEY_SET.has(normalizedKey)) {
      ctx.addIssue({
        code: 'custom',
        message: t('modals.gameConfig.validation.customConfigKeyReserved'),
        path: ['key'],
      })
    }
  })
}

function createCustomConfigSchema(t: I18nT) {
  return z.array(createCustomConfigEntrySchema(t)).superRefine((entries, ctx) => {
    const seenKeys = new Map<string, number>()

    for (const [index, entry] of entries.entries()) {
      if (isBlankCustomConfigEntry(entry)) {
        continue
      }

      const normalizedKey = normalizeCustomConfigKey(entry.key)
      const previousIndex = seenKeys.get(normalizedKey)
      if (previousIndex === undefined) {
        seenKeys.set(normalizedKey, index)
        continue
      }

      ctx.addIssue({
        code: 'custom',
        message: t('modals.gameConfig.validation.customConfigKeyDuplicate'),
        path: [index, 'key'],
      })
    }
  })
}

function parseBooleanValue(value: string | undefined, fallback: boolean): boolean {
  const normalizedValue = value?.trim().toLowerCase()

  switch (normalizedValue) {
    case 'false': {
      return false
    }
    case 'true': {
      return true
    }
    default: {
      return fallback
    }
  }
}

function parseOptionalNumberValue(
  value: string | undefined,
  isValid: (value: number) => boolean,
): '' | number {
  if (!value?.trim()) {
    return ''
  }

  const parsedValue = Number(value)
  return isValid(parsedValue) ? parsedValue : ''
}

function parseDefaultLanguage(value: string | undefined): '' | GameConfigDefaultLanguage {
  return GAME_CONFIG_DEFAULT_LANGUAGES.includes(value as GameConfigDefaultLanguage)
    ? value as GameConfigDefaultLanguage
    : ''
}

function createEntryValueMap(entries: readonly GameConfigEntry[]): ReadonlyMap<string, string> {
  return new Map(entries.map(entry => [entry.key, entry.value]))
}

function readEntryValue(entryValueMap: ReadonlyMap<string, string>, rawKey: string): string | undefined {
  return entryValueMap.get(rawKey)
}

export function createEmptyGameConfigFormValues(): GameConfigFormValues {
  return cloneGameConfigFormValues(EMPTY_GAME_CONFIG_FORM_VALUES)
}

export function cloneGameConfigFormValues(values: GameConfigFormValues): GameConfigFormValues {
  return {
    ...values,
    customConfig: cloneGameConfigEntries(values.customConfig),
    gameLogo: [...values.gameLogo],
  }
}

export function createGameConfigKey(): string {
  return crypto.randomUUID()
}

export function createGameConfigSchema(t: I18nT) {
  return z.object({
    customConfig: createCustomConfigSchema(t),
    defaultLanguage: z.union([
      z.literal(''),
      z.enum(GAME_CONFIG_DEFAULT_LANGUAGES),
    ]),
    description: createConfigValueSchema(t),
    enableAppreciation: z.boolean(),
    gameKey: createConfigValueSchema(t),
    gameName: createRequiredGameNameSchema(t),
    gameLogo: z.array(createConfigValueSchema(t)),
    legacyExpressionBlendMode: z.boolean(),
    lineHeight: createOptionalPositiveNumberSchema(t),
    maxLine: createOptionalPositiveIntegerSchema(t),
    packageName: createOptionalPackageNameSchema(t),
    showPanic: z.boolean(),
    steamAppId: createOptionalSteamAppIdSchema(t),
    titleBgm: createConfigValueSchema(t),
    titleImg: createConfigValueSchema(t),
  }) satisfies z.ZodType<GameConfigFormValues>
}

export function parseGameConfigFormValues(config: GameConfigReadResult): GameConfigFormValues {
  const entryValueMap = createEntryValueMap(config.entries)
  const customConfig = config.entries
    .filter(entry => !BUILT_IN_GAME_CONFIG_RAW_KEY_SET.has(entry.key))
    .map(entry => ({ ...entry }))

  return {
    ...createEmptyGameConfigFormValues(),
    customConfig,
    defaultLanguage: parseDefaultLanguage(readEntryValue(entryValueMap, 'Default_Language')),
    description: readEntryValue(entryValueMap, 'Description') ?? '',
    enableAppreciation: parseBooleanValue(readEntryValue(entryValueMap, 'Enable_Appreciation'), false),
    gameKey: readEntryValue(entryValueMap, 'Game_key') ?? '',
    gameName: readEntryValue(entryValueMap, 'Game_name') ?? '',
    gameLogo: parseGameLogoImages(readEntryValue(entryValueMap, 'Game_Logo') ?? ''),
    legacyExpressionBlendMode: parseBooleanValue(readEntryValue(entryValueMap, 'Legacy_Expression_Blend_Mode'), false),
    lineHeight: parseOptionalNumberValue(readEntryValue(entryValueMap, 'Line_height'), isPositiveFiniteNumber),
    maxLine: parseOptionalNumberValue(readEntryValue(entryValueMap, 'Max_line'), isPositiveInteger),
    packageName: readEntryValue(entryValueMap, 'Package_name') ?? '',
    showPanic: parseBooleanValue(readEntryValue(entryValueMap, 'Show_panic'), true),
    steamAppId: readEntryValue(entryValueMap, 'Steam_AppID') ?? '',
    titleBgm: readEntryValue(entryValueMap, 'Title_bgm') ?? '',
    titleImg: readEntryValue(entryValueMap, 'Title_img') ?? '',
  }
}

function appendOptionalStringEntry(entries: GameConfigEntry[], rawKey: string, value: string) {
  if (value === '') {
    return
  }

  entries.push({
    key: rawKey,
    value,
  })
}

function appendOptionalNumberEntry(entries: GameConfigEntry[], rawKey: string, value: '' | number) {
  if (value === '') {
    return
  }

  entries.push({
    key: rawKey,
    value: String(value),
  })
}

export function serializeGameConfigEntries(values: GameConfigFormValues): GameConfigWritePayload {
  const entries: GameConfigEntry[] = []

  appendOptionalStringEntry(entries, 'Game_name', values.gameName)
  appendOptionalStringEntry(entries, 'Description', values.description)
  appendOptionalStringEntry(entries, 'Title_img', values.titleImg)
  appendOptionalStringEntry(entries, 'Title_bgm', values.titleBgm)
  appendOptionalStringEntry(entries, 'Game_Logo', serializeGameLogoImages(values.gameLogo))
  appendOptionalStringEntry(entries, 'Default_Language', values.defaultLanguage)
  entries.push(
    {
      key: 'Enable_Appreciation',
      value: String(values.enableAppreciation),
    },
    {
      key: 'Legacy_Expression_Blend_Mode',
      value: String(values.legacyExpressionBlendMode),
    },
    {
      key: 'Show_panic',
      value: String(values.showPanic),
    },
  )
  appendOptionalNumberEntry(entries, 'Max_line', values.maxLine)
  appendOptionalNumberEntry(entries, 'Line_height', values.lineHeight)
  appendOptionalStringEntry(entries, 'Steam_AppID', values.steamAppId)
  appendOptionalStringEntry(entries, 'Package_name', values.packageName)
  appendOptionalStringEntry(entries, 'Game_key', values.gameKey)
  entries.push(
    ...values.customConfig
      .filter(entry => !isBlankCustomConfigEntry(entry))
      .map(entry => ({
        key: entry.key,
        value: entry.value,
      })),
  )

  return { entries }
}
