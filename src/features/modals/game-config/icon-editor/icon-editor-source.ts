import { readFile, readTextFile } from '@tauri-apps/plugin-fs'

import { AbsPath } from '~/domain/path'
import {
  GAME_ICON_DATA_BACKGROUND_RELATIVE_PATH,
  GAME_ICON_DATA_FOREGROUND_RELATIVE_PATH,
  GAME_ICON_DATA_STATE_RELATIVE_PATH,
} from '~/services/project-icon-assets'

import { ICON_EDITOR_STATE_VERSION } from './icon-editor-state'

import type { PersistedIconEditorState } from './icon-editor-state'

export interface IconEditorSourceData {
  backgroundBytes?: Uint8Array
  foregroundBytes: Uint8Array
  state: PersistedIconEditorState
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isOffsetRatio(value: unknown): value is PersistedIconEditorState['foregroundOffsetRatio'] {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y)
}

function parsePersistedIconEditorState(value: unknown): PersistedIconEditorState | undefined {
  if (!isRecord(value)) {
    return
  }

  const {
    backgroundColor,
    backgroundOffsetRatio,
    backgroundScale,
    backgroundType,
    foregroundOffsetRatio,
    foregroundScale,
    iconShape,
    version,
  } = value

  if (
    version !== ICON_EDITOR_STATE_VERSION
    || typeof backgroundColor !== 'string'
    || !isOffsetRatio(backgroundOffsetRatio)
    || !isFiniteNumber(backgroundScale)
    || (backgroundType !== 'color' && backgroundType !== 'image')
    || !isOffsetRatio(foregroundOffsetRatio)
    || !isFiniteNumber(foregroundScale)
    || (iconShape !== 'square' && iconShape !== 'rounded' && iconShape !== 'circle')
  ) {
    return
  }

  return {
    backgroundColor,
    backgroundOffsetRatio,
    backgroundScale,
    backgroundType,
    foregroundOffsetRatio,
    foregroundScale,
    iconShape,
    version,
  }
}

async function readSourceState(gamePath: AbsPath): Promise<PersistedIconEditorState | undefined> {
  const stateJson = await readTextFile(AbsPath.join(gamePath, GAME_ICON_DATA_STATE_RELATIVE_PATH))
  return parsePersistedIconEditorState(JSON.parse(stateJson))
}

export async function loadIconEditorSourceData(gamePath: AbsPath): Promise<IconEditorSourceData | undefined> {
  try {
    const state = await readSourceState(gamePath)
    if (!state) {
      return
    }

    const foregroundBytes = await readFile(AbsPath.join(gamePath, GAME_ICON_DATA_FOREGROUND_RELATIVE_PATH))
    if (state.backgroundType !== 'image') {
      return {
        foregroundBytes,
        state,
      }
    }

    return {
      backgroundBytes: await readFile(AbsPath.join(gamePath, GAME_ICON_DATA_BACKGROUND_RELATIVE_PATH)),
      foregroundBytes,
      state,
    }
  } catch {
    return
  }
}
