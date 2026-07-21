import { readTextFile } from '@tauri-apps/plugin-fs'

import { findGameConfigEntryValue } from '~/commands/game'
import { AbsPath } from '~/domain/path'
import { parseScene } from '~/domain/script/parser'
import { configManager } from '~/services/config-manager'
import { gameConfigPath, gameSceneDir } from '~/services/platform/app-paths'

import {
  getAssetFromCatalog,
  listAssetsByAssetType,
} from './catalog'
import { stringifyAssetKey } from './keys'
import { createReferencedAssetKey, shouldIndexAssetReferenceValue } from './values'

import type { AssetCatalogSnapshot } from './catalog'
import type { AssetKey } from './keys'
import type { ResourceReferenceQuery, SentenceResourceReferenceQuery } from './reference-query'
import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'

export type AssetReferenceSourceKind = 'scene' | 'game-config'

export interface AssetReferenceRecord {
  sourcePath: AbsPath
  sourceKind: AssetReferenceSourceKind
  assetKey: AssetKey
  fieldKey: string
  statementId?: number
}

export interface AssetReferenceDiagnostic {
  kind: 'missing-reference'
  assetKey: AssetKey
  references: AssetReferenceRecord[]
}

export interface AssetReferenceIndexSnapshot {
  records: AssetReferenceRecord[]
}

export interface AssetReferenceSourceFailure {
  sourcePath: AbsPath
  error: unknown
}

interface AssetReferenceSlice extends AssetReferenceIndexSnapshot {
  failures: AssetReferenceSourceFailure[]
}

export interface AssetReferenceSourceUpdate {
  snapshot: AssetReferenceIndexSnapshot
  failures: AssetReferenceSourceFailure[]
}

interface LoggedReferenceSourceFailure {
  signature: string
  loggedAt: number
}

const REFERENCE_SOURCE_FAILURE_RELOG_INTERVAL_MS = 5 * 60 * 1000

const loggedReferenceSourceFailures = new Map<AbsPath, LoggedReferenceSourceFailure>()

export function createEmptyAssetReferenceIndexSnapshot(): AssetReferenceIndexSnapshot {
  return {
    records: [],
  }
}

export function clearReferenceSourceFailureLogCache(): void {
  loggedReferenceSourceFailures.clear()
}

export async function buildAssetReferenceIndex(
  gamePath: AbsPath,
  catalog: AssetCatalogSnapshot,
  querySentenceResourceReferences: SentenceResourceReferenceQuery,
): Promise<AssetReferenceIndexSnapshot> {
  const sourceSlices = await Promise.all([
    ...listAssetsByAssetType(catalog, 'scene').map(entry => buildSceneReferenceSlice(entry.absolutePath, querySentenceResourceReferences)),
    buildGameConfigReferenceSlice(gamePath),
  ])
  logReferenceSourceFailures(sourceSlices.flatMap(slice => slice.failures))

  return {
    records: sourceSlices.flatMap(slice => slice.records),
  }
}

export async function rebuildReferenceSource(
  snapshot: AssetReferenceIndexSnapshot,
  gamePath: AbsPath,
  sourcePath: AbsPath,
  querySentenceResourceReferences: SentenceResourceReferenceQuery,
): Promise<AssetReferenceSourceUpdate> {
  if (isGameConfigPath(gamePath, sourcePath)) {
    const slice = await buildGameConfigReferenceSlice(gamePath)
    return {
      snapshot: replaceReferenceSource(snapshot, sourcePath, slice),
      failures: slice.failures,
    }
  }

  if (isScenePath(gamePath, sourcePath)) {
    const slice = await buildSceneReferenceSlice(sourcePath, querySentenceResourceReferences)
    return {
      snapshot: replaceReferenceSource(snapshot, sourcePath, slice),
      failures: slice.failures,
    }
  }

  return {
    snapshot,
    failures: [],
  }
}

export function removeReferenceSource(
  snapshot: AssetReferenceIndexSnapshot,
  sourcePath: AbsPath,
): AssetReferenceIndexSnapshot {
  clearReferenceSourceFailure(sourcePath)
  return {
    records: snapshot.records.filter(record => record.sourcePath !== sourcePath),
  }
}

export async function renameReferenceSource(
  snapshot: AssetReferenceIndexSnapshot,
  gamePath: AbsPath,
  oldPath: AbsPath,
  newPath: AbsPath,
  querySentenceResourceReferences: SentenceResourceReferenceQuery,
): Promise<AssetReferenceSourceUpdate> {
  if (!isGameConfigPath(gamePath, newPath) && !isScenePath(gamePath, newPath)) {
    return {
      snapshot: removeReferenceSource(snapshot, oldPath),
      failures: [],
    }
  }

  return rebuildReferenceSource(removeReferenceSource(snapshot, oldPath), gamePath, newPath, querySentenceResourceReferences)
}

export function getReferencesToAsset(
  snapshot: AssetReferenceIndexSnapshot,
  key: AssetKey,
): AssetReferenceRecord[] {
  const lookupKey = stringifyAssetKey(key)
  return snapshot.records.filter(record => stringifyAssetKey(record.assetKey) === lookupKey)
}

export function getReferencesFromSource(
  snapshot: AssetReferenceIndexSnapshot,
  sourcePath: AbsPath,
): AssetReferenceRecord[] {
  return snapshot.records.filter(record => record.sourcePath === sourcePath)
}

export function findMissingAssetReferences(
  snapshot: AssetReferenceIndexSnapshot,
  catalog: AssetCatalogSnapshot,
): AssetReferenceDiagnostic[] {
  const missingReferences = new Map<string, AssetReferenceRecord[]>()

  for (const record of snapshot.records) {
    if (getAssetFromCatalog(catalog, record.assetKey)) {
      continue
    }

    const lookupKey = stringifyAssetKey(record.assetKey)
    const records = missingReferences.get(lookupKey) ?? []
    records.push(record)
    missingReferences.set(lookupKey, records)
  }

  return Array.from(missingReferences.values(), references => ({
    kind: 'missing-reference',
    assetKey: references[0]!.assetKey,
    references,
  }))
}

function replaceReferenceSource(
  snapshot: AssetReferenceIndexSnapshot,
  sourcePath: AbsPath,
  slice: AssetReferenceIndexSnapshot,
): AssetReferenceIndexSnapshot {
  return {
    records: [
      ...snapshot.records.filter(record => record.sourcePath !== sourcePath),
      ...slice.records,
    ],
  }
}

function createEmptyAssetReferenceSlice(failures: AssetReferenceSourceFailure[] = []): AssetReferenceSlice {
  return {
    records: [],
    failures,
  }
}

function clearReferenceSourceFailure(sourcePath: AbsPath): void {
  loggedReferenceSourceFailures.delete(sourcePath)
}

export function logReferenceSourceFailures(failures: AssetReferenceSourceFailure[]): void {
  const now = Date.now()
  const nextFailures = failures.filter(({ error, sourcePath }) => {
    const signature = String(error)
    const loggedFailure = loggedReferenceSourceFailures.get(sourcePath)
    if (
      loggedFailure?.signature === signature
      && now - loggedFailure.loggedAt < REFERENCE_SOURCE_FAILURE_RELOG_INTERVAL_MS
    ) {
      return false
    }

    loggedReferenceSourceFailures.set(sourcePath, { signature, loggedAt: now })
    return true
  })

  if (nextFailures.length === 0) {
    return
  }

  const sampleFailures = nextFailures
    .slice(0, 3)
    .map(({ error, sourcePath }) => `${sourcePath} -> ${String(error)}`)
    .join('; ')
  const suffix = nextFailures.length > 3 ? ` 等 ${nextFailures.length - 3} 个` : ''
  logger.warn(
    `资源索引跳过 ${nextFailures.length} 个解析失败的引用来源: `
    + `${sampleFailures}${suffix}`,
  )
}

async function buildSceneReferenceSlice(
  sourcePath: AbsPath,
  querySentenceResourceReferences: SentenceResourceReferenceQuery,
): Promise<AssetReferenceSlice> {
  try {
    const text = await readTextFile(sourcePath)
    const scene = parseScene(text, AbsPath.basename(sourcePath), sourcePath)
    const sentences = scene?.sentenceList ?? []
    clearReferenceSourceFailure(sourcePath)
    return {
      records: sentences.flatMap((sentence, index) =>
        extractSentenceReferences(sourcePath, sentence, index + 1, querySentenceResourceReferences),
      ),
      failures: [],
    }
  } catch (error) {
    return createEmptyAssetReferenceSlice([{ sourcePath, error }])
  }
}

async function buildGameConfigReferenceSlice(gamePath: AbsPath): Promise<AssetReferenceSlice> {
  const sourcePath = gameConfigPath(gamePath)

  try {
    const config = await configManager.getConfig(gamePath)
    const titleImage = findGameConfigEntryValue(config.entries, 'Title_img')
    const titleBgm = findGameConfigEntryValue(config.entries, 'Title_bgm')
    const gameLogo = findGameConfigEntryValue(config.entries, 'Game_Logo')

    clearReferenceSourceFailure(sourcePath)
    return {
      records: [
        ...createGameConfigReferenceRecords(sourcePath, 'Title_img', 'background', titleImage),
        ...createGameConfigReferenceRecords(sourcePath, 'Title_bgm', 'bgm', titleBgm),
        ...createGameConfigReferenceRecords(sourcePath, 'Game_Logo', 'background', gameLogo, { splitValues: true }),
      ],
      failures: [],
    }
  } catch (error) {
    return createEmptyAssetReferenceSlice([{ sourcePath, error }])
  }
}

function extractSentenceReferences(
  sourcePath: AbsPath,
  sentence: ISentence,
  statementId: number,
  querySentenceResourceReferences: SentenceResourceReferenceQuery,
): AssetReferenceRecord[] {
  return querySentenceResourceReferences(sentence).map(reference => ({
    sourcePath,
    sourceKind: 'scene',
    assetKey: reference.assetKey,
    fieldKey: resolveReferenceFieldKey(reference),
    statementId,
  }))
}

function resolveReferenceFieldKey(
  reference: ResourceReferenceQuery,
): string {
  const source = reference.source
  switch (source.kind) {
    case 'content': {
      return '__content__'
    }
    case 'argument': {
      return source.key
    }
    case 'choice': {
      return `choose[${source.index}].file`
    }
    default: {
      return source satisfies never
    }
  }
}

function createReferenceRecord(
  sourcePath: AbsPath,
  sourceKind: AssetReferenceSourceKind,
  assetType: string,
  value: string,
  fieldKey: string,
  statementId?: number,
): AssetReferenceRecord[] {
  if (!shouldIndexAssetReferenceValue(assetType, value)) {
    return []
  }

  const assetKey = createReferencedAssetKey(assetType, value)
  if (!assetKey) {
    return []
  }

  return [{
    sourcePath,
    sourceKind,
    assetKey,
    fieldKey,
    ...(statementId === undefined ? {} : { statementId }),
  }]
}

function createGameConfigReferenceRecords(
  sourcePath: AbsPath,
  fieldKey: string,
  assetType: string,
  value: string | undefined,
  options: { splitValues?: boolean } = {},
): AssetReferenceRecord[] {
  if (!value) {
    return []
  }

  const values = options.splitValues
    ? value.split('|').map(item => item.trim()).filter(Boolean)
    : [value]

  return values.flatMap(item =>
    createReferenceRecord(sourcePath, 'game-config', assetType, item, fieldKey),
  )
}

function isGameConfigPath(gamePath: AbsPath, path: AbsPath): boolean {
  return path === gameConfigPath(gamePath)
}

function isScenePath(gamePath: AbsPath, path: AbsPath): boolean {
  const sceneRootPath = gameSceneDir(gamePath)
  return path.startsWith(`${sceneRootPath}/`) && path.endsWith('.txt')
}
