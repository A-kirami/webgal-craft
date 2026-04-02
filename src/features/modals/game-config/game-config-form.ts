import * as z from 'zod'

import {
  parseGameLogoImages,
  serializeGameLogoImages,
} from './game-config-images'

import type { GameConfig, GameConfigPatch, GameConfigPatchKey } from '~/commands/game'
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

export interface GameConfigFormValues {
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

function createOptionalPositiveIntegerSchema(t: I18nT) {
  return z.union([z.literal(''), z.number()]).refine(
    value => value === '' || (Number.isInteger(value) && value > 0),
    t('modals.gameConfig.validation.maxLineInvalid'),
  ) as z.ZodType<'' | number>
}

function createRequiredGameNameSchema(t: I18nT) {
  return z.string().trim().min(1, t('modals.gameConfig.validation.gameNameRequired'))
}

function createOptionalPositiveNumberSchema(t: I18nT) {
  return z.union([z.literal(''), z.number()]).refine(
    value => value === '' || value > 0,
    t('modals.gameConfig.validation.lineHeightInvalid'),
  ) as z.ZodType<'' | number>
}

function createOptionalPackageNameSchema(t: I18nT) {
  return z.string().trim().refine(
    value => value === '' || /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(value),
    t('modals.gameConfig.validation.packageNameInvalid'),
  )
}

function createOptionalSteamAppIdSchema(t: I18nT) {
  return z.string().trim().refine((value) => {
    if (value === '') {
      return true
    }

    if (!/^\d+$/.test(value)) {
      return false
    }

    const numericValue = BigInt(value)
    return numericValue >= 1n && numericValue <= 42_9496_7295n
  }, t('modals.gameConfig.validation.steamAppIdInvalid'))
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

function parseOptionalNumberValue(value: string | undefined): '' | number {
  if (!value?.trim()) {
    return ''
  }

  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) ? parsedValue : ''
}

function parseDefaultLanguage(value: string | undefined): '' | GameConfigDefaultLanguage {
  return GAME_CONFIG_DEFAULT_LANGUAGES.includes(value as GameConfigDefaultLanguage)
    ? value as GameConfigDefaultLanguage
    : ''
}

export function createEmptyGameConfigFormValues(): GameConfigFormValues {
  return {
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
  }
}

export function cloneGameConfigFormValues(values: GameConfigFormValues): GameConfigFormValues {
  return {
    ...values,
    gameLogo: [...values.gameLogo],
  }
}

export function createGameConfigKey(): string {
  return crypto.randomUUID()
}

export function createGameConfigSchema(t: I18nT) {
  return z.object({
    defaultLanguage: z.union([
      z.literal(''),
      z.enum(GAME_CONFIG_DEFAULT_LANGUAGES),
    ]),
    description: z.string(),
    enableAppreciation: z.boolean(),
    gameKey: z.string(),
    gameName: createRequiredGameNameSchema(t),
    gameLogo: z.array(z.string()),
    legacyExpressionBlendMode: z.boolean(),
    lineHeight: createOptionalPositiveNumberSchema(t),
    maxLine: createOptionalPositiveIntegerSchema(t),
    packageName: createOptionalPackageNameSchema(t),
    showPanic: z.boolean(),
    steamAppId: createOptionalSteamAppIdSchema(t),
    titleBgm: z.string(),
    titleImg: z.string(),
  })
}

export function parseGameConfigFormValues(config: GameConfig): GameConfigFormValues {
  return {
    ...createEmptyGameConfigFormValues(),
    defaultLanguage: parseDefaultLanguage(config.defaultLanguage),
    description: config.description ?? '',
    enableAppreciation: parseBooleanValue(config.enableAppreciation, false),
    gameKey: config.gameKey ?? '',
    gameName: config.gameName ?? '',
    gameLogo: parseGameLogoImages(config.gameLogo ?? ''),
    legacyExpressionBlendMode: parseBooleanValue(config.legacyExpressionBlendMode, false),
    lineHeight: parseOptionalNumberValue(config.lineHeight),
    maxLine: parseOptionalNumberValue(config.maxLine),
    packageName: config.packageName ?? '',
    showPanic: parseBooleanValue(config.showPanic, true),
    steamAppId: config.steamAppId ?? '',
    titleBgm: config.titleBgm ?? '',
    titleImg: config.titleImg ?? '',
  }
}

function assignOptionalStringPatch(patch: GameConfigPatch, key: GameConfigPatchKey, value: string) {
  if (value === '') {
    patch.unset.push(key)
    return
  }

  patch.set[key] = value
}

function assignOptionalNumberPatch(patch: GameConfigPatch, key: GameConfigPatchKey, value: '' | number) {
  if (value === '') {
    patch.unset.push(key)
    return
  }

  patch.set[key] = String(value)
}

export function serializeGameConfigPatch(values: GameConfigFormValues): GameConfigPatch {
  const patch: GameConfigPatch = {
    set: {
      enableAppreciation: String(values.enableAppreciation),
      legacyExpressionBlendMode: String(values.legacyExpressionBlendMode),
      showPanic: String(values.showPanic),
    },
    unset: [],
  }

  assignOptionalStringPatch(patch, 'defaultLanguage', values.defaultLanguage)
  assignOptionalStringPatch(patch, 'description', values.description)
  assignOptionalStringPatch(patch, 'gameKey', values.gameKey)
  assignOptionalStringPatch(patch, 'gameName', values.gameName)
  assignOptionalStringPatch(patch, 'gameLogo', serializeGameLogoImages(values.gameLogo))
  assignOptionalNumberPatch(patch, 'lineHeight', values.lineHeight)
  assignOptionalNumberPatch(patch, 'maxLine', values.maxLine)
  assignOptionalStringPatch(patch, 'packageName', values.packageName)
  assignOptionalStringPatch(patch, 'steamAppId', values.steamAppId)
  assignOptionalStringPatch(patch, 'titleBgm', values.titleBgm)
  assignOptionalStringPatch(patch, 'titleImg', values.titleImg)

  return patch
}
