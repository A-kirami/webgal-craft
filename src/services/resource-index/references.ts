import { readTextFile } from '@tauri-apps/plugin-fs'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { findGameConfigEntryValue } from '~/commands/game'
import { AbsPath } from '~/domain/path'
import { parseChooseContent } from '~/domain/script/content'
import { parseScene } from '~/domain/script/parser'
import { readCommandConfig } from '~/features/editor/command-registry'
import {
  deriveArgFieldsFromEditorFields,
  readArgFieldStorageKey,
  readEditorFields,
} from '~/features/editor/command-registry/schema'
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
import type { arg, ISentence } from 'webgal-parser/src/interface/sceneInterface'

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

interface AssetReferenceSourceFailure {
  sourcePath: AbsPath
  error: unknown
}

interface AssetReferenceSlice extends AssetReferenceIndexSnapshot {
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
): Promise<AssetReferenceIndexSnapshot> {
  const sourceSlices = await Promise.all([
    ...listAssetsByAssetType(catalog, 'scene').map(entry => buildSceneReferenceSlice(entry.absolutePath)),
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
): Promise<AssetReferenceIndexSnapshot> {
  if (isGameConfigPath(gamePath, sourcePath)) {
    const slice = await buildGameConfigReferenceSlice(gamePath)
    logReferenceSourceFailures(slice.failures)
    return replaceReferenceSource(snapshot, sourcePath, slice)
  }

  if (isScenePath(gamePath, sourcePath)) {
    const slice = await buildSceneReferenceSlice(sourcePath)
    logReferenceSourceFailures(slice.failures)
    return replaceReferenceSource(snapshot, sourcePath, slice)
  }

  return snapshot
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
): Promise<AssetReferenceIndexSnapshot> {
  if (!isGameConfigPath(gamePath, newPath) && !isScenePath(gamePath, newPath)) {
    return removeReferenceSource(snapshot, oldPath)
  }

  return rebuildReferenceSource(removeReferenceSource(snapshot, oldPath), gamePath, newPath)
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

function logReferenceSourceFailures(failures: AssetReferenceSourceFailure[]): void {
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
  const suffix = nextFailures.length > 3 ? ` 等 ${nextFailures.length} 个` : ''
  logger.warn(
    `资源索引跳过 ${nextFailures.length} 个解析失败的引用来源: `
    + `${sampleFailures}${suffix}`,
  )
}

async function buildSceneReferenceSlice(sourcePath: AbsPath): Promise<AssetReferenceSlice> {
  try {
    const text = await readTextFile(sourcePath)
    const scene = parseScene(text, AbsPath.basename(sourcePath), sourcePath)
    const sentences = scene?.sentenceList ?? []
    clearReferenceSourceFailure(sourcePath)
    return {
      records: sentences.flatMap((sentence, index) =>
        extractSentenceReferences(sourcePath, sentence, index + 1),
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
): AssetReferenceRecord[] {
  const entry = readCommandConfig(sentence.command)
  const editorFields = readEditorFields(entry)
  const contentField = editorFields.find(field => field.storage === 'content')
  const argFields = deriveArgFieldsFromEditorFields(editorFields)

  return [
    ...extractContentReferences(sourcePath, sentence, statementId, contentField?.field),
    ...extractArgReferences(sourcePath, sentence, statementId, argFields),
  ]
}

function extractContentReferences(
  sourcePath: AbsPath,
  sentence: ISentence,
  statementId: number,
  field: ReturnType<typeof readEditorFields>[number]['field'] | undefined,
): AssetReferenceRecord[] {
  if (field?.type !== 'file') {
    return []
  }

  const { assetType } = field.fileConfig
  if (assetType === 'scene' && sentence.command === commandType.choose) {
    return parseChooseContent(sentence.content)
      .flatMap((item, index) =>
        createReferenceRecord(sourcePath, 'scene', assetType, item.file, `choose[${index}].file`, statementId),
      )
  }

  return createReferenceRecord(sourcePath, 'scene', assetType, sentence.content, '__content__', statementId)
}

function extractArgReferences(
  sourcePath: AbsPath,
  sentence: ISentence,
  statementId: number,
  argFields: ReturnType<typeof deriveArgFieldsFromEditorFields>,
): AssetReferenceRecord[] {
  return argFields.flatMap((argField) => {
    if (argField.jsonMeta || argField.field.type !== 'file') {
      return []
    }

    const argKey = readArgFieldStorageKey(argField)
    const item = sentence.args.find((argItem: arg) => argItem.key === argKey)
    if (!item || typeof item.value !== 'string') {
      return []
    }

    return createReferenceRecord(
      sourcePath,
      'scene',
      argField.field.fileConfig.assetType,
      item.value,
      argKey,
      statementId,
    )
  })
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
