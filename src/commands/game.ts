import * as z from 'zod'

import { safeInvoke } from '~/utils/invoke'

export const BUILT_IN_GAME_CONFIG_RAW_KEYS = [
  'Game_name',
  'Game_key',
  'Title_img',
  'Title_bgm',
  'Game_Logo',
  'Enable_Appreciation',
  'Legacy_Expression_Blend_Mode',
  'Steam_AppID',
  'Default_Language',
  'Show_panic',
  'Max_line',
  'Line_height',
  'Description',
  'Package_name',
] as const

export interface GameConfigEntry {
  key: string
  value: string
}

export interface GameConfigReadResult {
  entries: GameConfigEntry[]
  unmanagedLineCount: number
}

export interface GameConfigWritePayload {
  entries: GameConfigEntry[]
}

export function findGameConfigEntryValue(entries: readonly GameConfigEntry[], rawKey: string): string | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry?.key === rawKey) {
      return entry.value
    }
  }
}

const gameConfigEntryShapeSchema = z.object({
  key: z.string(),
  value: z.string(),
}) satisfies z.ZodType<GameConfigEntry>

const gameConfigEntriesShapeSchema = z.array(gameConfigEntryShapeSchema) satisfies z.ZodType<GameConfigEntry[]>

const gameConfigReadPayloadShapeSchema = z.looseObject({
  entries: gameConfigEntriesShapeSchema,
  unmanagedLineCount: z.number().int().nonnegative(),
}) satisfies z.ZodType<GameConfigReadResult>

async function getGameConfig(gamePath: string) {
  return gameConfigReadPayloadShapeSchema.parse(await safeInvoke<unknown>('get_game_config', { gamePath }))
}

async function setGameConfig(gamePath: string, config: GameConfigWritePayload) {
  return safeInvoke<void>('set_game_config', { gamePath, config })
}

export const gameCmds = {
  getGameConfig,
  setGameConfig,
}
