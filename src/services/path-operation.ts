import { exists } from '@tauri-apps/plugin-fs'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { gameCmds } from '~/commands/game'
import { useFileSystemEvents } from '~/composables/useFileSystemEvents'
import { decodeTextFile, encodeTextFile } from '~/domain/document/file-codec'
import { AbsPath, RelPath } from '~/domain/path'
import { parseChooseContent, stringifyChooseContent } from '~/domain/script/content'
import { parseSceneOrEmpty } from '~/domain/script/parser'
import { serializeSentence } from '~/domain/script/serialize'
import { backupManager } from '~/services/backup-manager'
import { gameFs } from '~/services/game-fs'
import { gameManager } from '~/services/game-manager'
import { pathOperationRegistry } from '~/services/path-operation-registry'
import { gameAssetDir, gameRootDir } from '~/services/platform/app-paths'
import { useResourceIndex } from '~/services/resource-index/service'
import { useEditorStore } from '~/stores/editor'
import { useFileStore } from '~/stores/file'
import { useWorkspaceStore } from '~/stores/workspace'
import { buildUniqueEntryName } from '~/utils/entry-name'

import type { GameConfigReadResult, GameConfigWritePayload } from '~/commands/game'
import type { FileSystemEvent } from '~/composables/useFileSystemEvents'
import type { TextMetadata } from '~/domain/document/document-model'
import type { PathEchoMode, PathMutationResult } from '~/services/path-mutation'
import type {
  PathOperationBlockReasonMessage,
  PathOperationMessage,
  PathOperationWarning,
} from '~/services/path-operation-feedback'
import type { AssetCatalogEntry } from '~/services/resource-index/catalog'
import type { AssetKey } from '~/services/resource-index/keys'
import type { AssetReferenceRecord } from '~/services/resource-index/references'

export type PathOperationKind = 'rename' | 'move'
export type PathOperationSource = 'disk' | 'editor-buffer'

export interface PathOperationInput {
  kind: PathOperationKind
  sourcePath: AbsPath
  target: { type: 'name', name: string } | { type: 'directory', directory: AbsPath }
}

export type SceneBaselineRevision =
  | { kind: 'editor-buffer', revision: number | string }
  | { kind: 'disk-hash', hash: string }

export interface AssetReferenceRewrite {
  filePath: AbsPath
  kind: 'scene' | 'game-config'
  referenceCount: number
  before: string
  after: string
  source: PathOperationSource
  baselineRevision: SceneBaselineRevision
  metadata?: TextMetadata
  config?: GameConfigWritePayload
}

export interface PathOperationBlockReason {
  kind:
    | 'cross-root-move'
    | 'unsupported-reference'
    | 'duplicate-target'
    | 'in-flight-conflict'
  i18nMessage: PathOperationBlockReasonMessage['i18nMessage']
  filePath?: AbsPath
}

export interface PlanRollbackContext {
  files: {
    filePath: AbsPath
    kind: 'scene' | 'game-config'
    snapshotContent: string
    metadata?: TextMetadata
    config?: GameConfigWritePayload
    source: PathOperationSource
    baselineRevision: SceneBaselineRevision
  }[]
}

export interface PathOperationPlan {
  kind: PathOperationKind
  sourcePath: AbsPath
  targetPath: AbsPath
  rewrites: AssetReferenceRewrite[]
  blockedReasons: PathOperationBlockReason[]
  rollback: PlanRollbackContext
}

export type PathOperationConfirmDecision = 'rewrite' | 'path-only' | 'cancel'

export interface PathOperationResult {
  plan: PathOperationPlan
  cancelled: boolean
  finalPath: AbsPath
  warnings: PathOperationWarning[]
}

export interface EditorBufferSnapshot {
  content: string
  metadata: TextMetadata
  revision: number | string
}

export interface PathOperationDeps {
  editor: {
    peekSceneBuffer(path: AbsPath): EditorBufferSnapshot | undefined
    peekSceneRevision(path: AbsPath): number | string | undefined
    applySystemRefactor(
      path: AbsPath,
      content: string,
      metadata: TextMetadata,
      expectedRevision: number | string,
    ): boolean
  }
  fileStore: {
    applyPathMutation(sourcePath: AbsPath, newPath: AbsPath): void | Promise<void>
    getItemByPath(path: AbsPath): { isDir: boolean } | undefined
    invalidatePathOperationCaches(oldPath: AbsPath, newPath: AbsPath): void | Promise<void>
    refreshItemMetadata(path: AbsPath): void | Promise<void>
  }
  fileSystemEvents: {
    emit(event: FileSystemEvent): void
  }
  gameConfig: {
    getConfig(gamePath: AbsPath): Promise<GameConfigReadResult>
    setConfig(gamePath: AbsPath, config: GameConfigWritePayload): Promise<void>
  }
  gameFs: {
    readDocumentFile(path: AbsPath): Promise<Uint8Array>
    renameFile(oldPath: AbsPath, newName: string): Promise<PathMutationResult>
    moveFile(sourcePath: AbsPath, targetDirectory: AbsPath, targetName?: string): Promise<PathMutationResult>
    writeDocumentFile(path: AbsPath, content: Uint8Array): Promise<void>
  }
  gameManager: {
    refreshRegisteredGameSnapshot(gamePath: AbsPath): Promise<void>
  }
  getGamePath(): AbsPath | undefined
  history: {
    migrateSceneHistory(args: {
      oldLogicalPath: RelPath
      newLogicalPath: RelPath
      projectPath: AbsPath
    }): Promise<void>
  }
  pathOperationRegistry: {
    register(input: { sourcePath: AbsPath, targetPath: AbsPath }): number
    updateChannel(id: number, input: {
      echoMode: PathEchoMode
      expectedEchoes: number
    }): boolean
    release(id: number): boolean
    markSettled(id: number): boolean
    hasOverlap(paths: readonly AbsPath[]): boolean
  }
  resourceIndex: {
    resolveByAbsolutePath(path: AbsPath): AssetCatalogEntry | undefined
    listByAssetType(assetType: string): AssetCatalogEntry[]
    getReferencesTo(key: AssetKey): AssetReferenceRecord[]
  }
}

interface EffectiveSceneDocument {
  content: string
  metadata: TextMetadata
  source: PathOperationSource
  baselineRevision: SceneBaselineRevision
}

interface SceneHistoryMigrationContext {
  projectPath: AbsPath
  oldLogicalPath: RelPath
  newLogicalPath: RelPath
}

export class PathOperationError extends Error {
  constructor(
    public readonly code: 'blocked-plan' | 'stale-plan' | 'unsupported-text',
    public readonly i18nMessage: PathOperationMessage['i18nMessage'],
    public readonly blockedReasons?: readonly PathOperationBlockReason[],
  ) {
    super(`路径操作错误: ${code}`)
    this.name = 'PathOperationError'
  }
}

function resolveNominalTargetPath(input: PathOperationInput): AbsPath {
  if (input.target.type === 'name') {
    return AbsPath.append(AbsPath.parent(input.sourcePath), input.target.name)
  }

  return AbsPath.append(input.target.directory, AbsPath.basename(input.sourcePath))
}

async function isExistingPath(deps: PathOperationDeps, path: AbsPath): Promise<boolean> {
  if (deps.fileStore.getItemByPath(path)) {
    return true
  }

  try {
    return await exists(path)
  } catch {
    return false
  }
}

async function resolveMoveTargetPath(deps: PathOperationDeps, sourcePath: AbsPath, targetDirectory: AbsPath): Promise<AbsPath> {
  const sourceItem = deps.fileStore.getItemByPath(sourcePath)
  const sourceName = AbsPath.basename(sourcePath)
  if (AbsPath.equals(AbsPath.parent(sourcePath), targetDirectory)) {
    return AbsPath.append(targetDirectory, sourceName)
  }

  const existingNames = new Set<string>()
  let nextName = sourceName

  // 目标名需要按 “foo.ext -> foo (1).ext -> ...” 顺序探测，串行检查才能保持命名确定性。
  // eslint-disable-next-line no-await-in-loop
  while (await isExistingPath(deps, AbsPath.append(targetDirectory, nextName))) {
    existingNames.add(nextName)
    nextName = buildUniqueEntryName(sourceName, sourceItem?.isDir ?? false, existingNames)
  }

  return AbsPath.append(targetDirectory, nextName)
}

async function resolveTargetPath(deps: PathOperationDeps, input: PathOperationInput): Promise<AbsPath> {
  if (input.kind === 'move' && input.target.type === 'directory') {
    return await resolveMoveTargetPath(deps, input.sourcePath, input.target.directory)
  }

  return resolveNominalTargetPath(input)
}

async function createStableHash(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function createDiskBaselineRevision(
  content: string,
  metadata: TextMetadata,
): Promise<SceneBaselineRevision> {
  return {
    kind: 'disk-hash',
    hash: await createStableHash(`${metadata.encoding}\0${metadata.lineEnding}\0${content}`),
  }
}

function cloneGameConfigEntries(config: GameConfigReadResult): GameConfigWritePayload {
  return {
    entries: config.entries.map(entry => ({ ...entry })),
  }
}

function asGameConfigReadResult(
  config: GameConfigWritePayload,
  unmanagedLineCount: number,
): GameConfigReadResult {
  return {
    entries: config.entries,
    unmanagedLineCount,
  }
}

async function createGameConfigBaselineRevision(config: GameConfigReadResult): Promise<SceneBaselineRevision> {
  return {
    kind: 'disk-hash',
    hash: await createStableHash(JSON.stringify({
      entries: config.entries,
      unmanagedLineCount: config.unmanagedLineCount,
    })),
  }
}

function isSameBaselineRevision(left: SceneBaselineRevision, right: SceneBaselineRevision): boolean {
  switch (left.kind) {
    case 'disk-hash': {
      return right.kind === 'disk-hash' && left.hash === right.hash
    }
    case 'editor-buffer': {
      return right.kind === 'editor-buffer' && left.revision === right.revision
    }
    default: {
      return false
    }
  }
}

async function readEffectiveSceneDocument(
  deps: PathOperationDeps,
  path: AbsPath,
): Promise<EffectiveSceneDocument> {
  const editorBuffer = deps.editor.peekSceneBuffer(path)
  if (editorBuffer) {
    return {
      content: editorBuffer.content,
      metadata: editorBuffer.metadata,
      source: 'editor-buffer',
      baselineRevision: {
        kind: 'editor-buffer',
        revision: editorBuffer.revision,
      },
    }
  }

  const decoded = decodeTextFile(await deps.gameFs.readDocumentFile(path))
  if (!decoded.ok) {
    throw new PathOperationError(
      'unsupported-text',
      t => t('edit.pathOperation.errors.unsupportedText', {
        path,
      }),
    )
  }

  return {
    content: decoded.content,
    metadata: decoded.metadata,
    source: 'disk',
    baselineRevision: await createDiskBaselineRevision(decoded.content, decoded.metadata),
  }
}

async function readCurrentBaselineRevision(
  deps: PathOperationDeps,
  file: PlanRollbackContext['files'][number],
): Promise<SceneBaselineRevision> {
  if (file.baselineRevision.kind === 'editor-buffer') {
    const revision = deps.editor.peekSceneRevision(file.filePath)
    if (revision === undefined) {
      throw new PathOperationError(
        'stale-plan',
        t => t('edit.pathOperation.errors.stalePlan', {
          path: file.filePath,
        }),
      )
    }
    return {
      kind: 'editor-buffer',
      revision,
    }
  }

  if (file.kind === 'game-config') {
    const gamePath = deps.getGamePath()
    if (!gamePath) {
      throw new PathOperationError(
        'stale-plan',
        t => t('edit.pathOperation.errors.currentProjectUnavailable'),
      )
    }

    return await createGameConfigBaselineRevision(await deps.gameConfig.getConfig(gamePath))
  }

  if (!file.metadata) {
    throw new PathOperationError(
      'stale-plan',
      t => t('edit.pathOperation.errors.missingTextMetadata', {
        path: file.filePath,
      }),
    )
  }

  const decoded = decodeTextFile(await deps.gameFs.readDocumentFile(file.filePath))
  if (!decoded.ok) {
    throw new PathOperationError(
      'unsupported-text',
      t => t('edit.pathOperation.errors.unsupportedText', {
        path: file.filePath,
      }),
    )
  }

  return await createDiskBaselineRevision(decoded.content, decoded.metadata)
}

function resolveAssetRootPath(gamePath: AbsPath, key: AssetKey): AbsPath {
  return gameAssetDir(gamePath, key.assetType)
}

function resolveTargetAssetKey(
  gamePath: AbsPath,
  sourceAsset: AssetCatalogEntry,
  targetPath: AbsPath,
): AssetKey | undefined {
  try {
    const relativePath = AbsPath.relativize(targetPath, resolveAssetRootPath(gamePath, sourceAsset.key))
    return {
      ...sourceAsset.key,
      relativePath,
    }
  } catch {
    return
  }
}

function isPathWithinOrEqual(path: AbsPath, root: AbsPath): boolean {
  if (AbsPath.equals(path, root)) {
    return true
  }

  try {
    AbsPath.relativize(path, root)
    return true
  } catch {
    return false
  }
}

function resolveCatalogPath(gamePath: AbsPath, absolutePath: AbsPath): {
  assetType: string
  relativePath: RelPath
} | undefined {
  let relativeToGameRoot: RelPath
  try {
    relativeToGameRoot = AbsPath.relativize(absolutePath, gameRootDir(gamePath))
  } catch {
    return
  }

  const segments = relativeToGameRoot.split('/').filter(Boolean)
  if (segments.length === 0) {
    return
  }

  return {
    assetType: segments[0]!,
    relativePath: RelPath.from(segments.slice(1).join('/')),
  }
}

function rebaseRelPath(path: RelPath, oldRoot: RelPath, newRoot: RelPath): RelPath {
  if (RelPath.equals(path, oldRoot)) {
    return newRoot
  }

  if (RelPath.equals(oldRoot, RelPath.empty())) {
    return RelPath.from(newRoot ? `${newRoot}/${path}` : path)
  }

  if (!path.startsWith(`${oldRoot}/`)) {
    return path
  }

  const suffix = path.slice(oldRoot.length + 1)
  return RelPath.from(newRoot ? `${newRoot}/${suffix}` : suffix)
}

function resolveAffectedAssets(
  deps: PathOperationDeps,
  gamePath: AbsPath,
  sourcePath: AbsPath,
  targetPath: AbsPath,
): {
  entries: {
    sourceAsset: AssetCatalogEntry
    targetKey: AssetKey
  }[]
  blocked: boolean
} {
  const sourceAsset = deps.resourceIndex.resolveByAbsolutePath(sourcePath)
  if (sourceAsset) {
    const targetKey = resolveTargetAssetKey(gamePath, sourceAsset, targetPath)
    return {
      entries: targetKey ? [{ sourceAsset, targetKey }] : [],
      blocked: !targetKey,
    }
  }

  const sourceCatalogPath = resolveCatalogPath(gamePath, sourcePath)
  const targetCatalogPath = resolveCatalogPath(gamePath, targetPath)
  if (!sourceCatalogPath || !targetCatalogPath) {
    return {
      entries: [],
      blocked: false,
    }
  }
  if (sourceCatalogPath.assetType !== targetCatalogPath.assetType) {
    return {
      entries: [],
      blocked: true,
    }
  }

  const sourceRootPath = gameAssetDir(gamePath, sourceCatalogPath.assetType)
  const assets = deps.resourceIndex
    .listByAssetType(sourceCatalogPath.assetType)
    .filter(asset => isPathWithinOrEqual(asset.absolutePath, sourcePath))
  const entries = assets.map((asset) => {
    const targetRelativePath = rebaseRelPath(
      asset.key.relativePath,
      sourceCatalogPath.relativePath,
      targetCatalogPath.relativePath,
    )
    return {
      sourceAsset: asset,
      targetKey: {
        ...asset.key,
        relativePath: targetRelativePath,
      },
    }
  })
  return {
    entries,
    blocked: assets.length > 0 && !isPathWithinOrEqual(targetPath, sourceRootPath),
  }
}

function cloneReferenceSentence(sentence: ReturnType<typeof parseSceneOrEmpty>['sentenceList'][number]) {
  return {
    ...sentence,
    args: sentence.args.map(arg => ({ ...arg })),
    sentenceAssets: [...sentence.sentenceAssets],
    subScene: [...sentence.subScene],
  }
}

function rewriteSceneContent(
  content: string,
  records: readonly AssetReferenceRecord[],
  oldReferencePath: RelPath,
  newReferencePath: RelPath,
): { after: string, referenceCount: number, unsupported: AssetReferenceRecord[] } {
  const lines = content.split('\n')
  const scene = parseSceneOrEmpty(content)
  let referenceCount = 0
  const unsupported: AssetReferenceRecord[] = []
  const changedSentences = new Map<number, ReturnType<typeof cloneReferenceSentence>>()

  for (const record of records) {
    const { statementId } = record
    if (statementId === undefined) {
      unsupported.push(record)
      continue
    }

    const sourceSentence = scene.sentenceList[statementId - 1]
    const sentence = changedSentences.get(statementId)
      ?? (sourceSentence ? cloneReferenceSentence(sourceSentence) : undefined)
    if (!sentence) {
      unsupported.push(record)
      continue
    }

    if (record.fieldKey === '__content__') {
      if (sentence.content === oldReferencePath) {
        sentence.content = newReferencePath
        referenceCount += 1
      }
      changedSentences.set(statementId, sentence)
      continue
    }

    const chooseMatch = record.fieldKey.match(/^choose\[(\d+)]\.file$/)
    if (sentence.command === commandType.choose && chooseMatch) {
      const itemIndex = Number(chooseMatch[1])
      const items = parseChooseContent(sentence.content)
      const item = items[itemIndex]
      if (item?.file === oldReferencePath) {
        item.file = newReferencePath
        sentence.content = stringifyChooseContent(items)
        referenceCount += 1
      }
      changedSentences.set(statementId, sentence)
      continue
    }

    const arg = sentence.args.find(item => item.key === record.fieldKey)
    if (arg && typeof arg.value === 'string') {
      if (arg.value === oldReferencePath) {
        arg.value = newReferencePath
        referenceCount += 1
      }
      changedSentences.set(statementId, sentence)
      continue
    }

    unsupported.push(record)
  }

  for (const [statementId, sentence] of changedSentences) {
    lines[statementId - 1] = serializeSentence(sentence)
  }

  return {
    after: lines.join('\n'),
    referenceCount,
    unsupported,
  }
}

function rewriteGameConfig(
  config: GameConfigReadResult,
  records: readonly AssetReferenceRecord[],
  oldReferencePath: RelPath,
  newReferencePath: RelPath,
): { config: GameConfigWritePayload, referenceCount: number, unsupported: AssetReferenceRecord[] } {
  const supportedFields = new Set(['Title_img', 'Title_bgm', 'Game_Logo'])
  const fieldKeys = new Set(records.map(record => record.fieldKey))
  const unsupported = records.filter(record => !supportedFields.has(record.fieldKey))
  let referenceCount = 0

  const entries = config.entries.map((entry) => {
    if (!fieldKeys.has(entry.key) || !supportedFields.has(entry.key)) {
      return entry
    }

    const values = entry.key === 'Game_Logo'
      ? entry.value.split('|')
      : [entry.value]
    const nextValues = values.map((value) => {
      if (value.trim() !== oldReferencePath) {
        return value
      }
      referenceCount += 1
      return newReferencePath
    })

    return {
      ...entry,
      value: entry.key === 'Game_Logo' ? nextValues.join('|') : nextValues[0] ?? '',
    }
  })

  return {
    config: { entries },
    referenceCount,
    unsupported,
  }
}

function groupReferencesBySource(records: readonly AssetReferenceRecord[]): Map<AbsPath, AssetReferenceRecord[]> {
  const grouped = new Map<AbsPath, AssetReferenceRecord[]>()
  for (const record of records) {
    const sourceRecords = grouped.get(record.sourcePath) ?? []
    sourceRecords.push(record)
    grouped.set(record.sourcePath, sourceRecords)
  }
  return grouped
}

async function buildReferenceRewrites(
  deps: PathOperationDeps,
  gamePath: AbsPath,
  rewritePairs: readonly {
    records: readonly AssetReferenceRecord[]
    oldReferencePath: RelPath
    newReferencePath: RelPath
  }[],
  blockedReasons: PathOperationBlockReason[],
): Promise<{
  rewrites: AssetReferenceRewrite[]
  rollbackFiles: PlanRollbackContext['files']
}> {
  const rewrites: AssetReferenceRewrite[] = []
  const rollbackFiles: PlanRollbackContext['files'] = []
  const sourceReferences = new Map<AbsPath, {
    sourceRecords: AssetReferenceRecord[]
    oldReferencePath: RelPath
    newReferencePath: RelPath
  }[]>()

  for (const pair of rewritePairs) {
    for (const [sourcePath, sourceRecords] of groupReferencesBySource(pair.records)) {
      const existing = sourceReferences.get(sourcePath) ?? []
      existing.push({
        sourceRecords,
        oldReferencePath: pair.oldReferencePath,
        newReferencePath: pair.newReferencePath,
      })
      sourceReferences.set(sourcePath, existing)
    }
  }

  for (const [sourcePath, sourcePairs] of sourceReferences) {
    const sourceKind = sourcePairs[0]?.sourceRecords[0]?.sourceKind
    if (sourceKind === 'scene') {
      // eslint-disable-next-line no-await-in-loop -- 每个引用源需要按确定顺序固化 rollback 快照。
      const snapshot = await readEffectiveSceneDocument(deps, sourcePath)
      let nextContent = snapshot.content
      let referenceCount = 0
      for (const pair of sourcePairs) {
        const result = rewriteSceneContent(
          nextContent,
          pair.sourceRecords,
          pair.oldReferencePath,
          pair.newReferencePath,
        )
        for (const record of result.unsupported) {
          blockedReasons.push({
            kind: 'unsupported-reference',
            i18nMessage: t => t('edit.pathOperation.errors.unsupportedReferenceField', {
              fieldKey: record.fieldKey,
            }),
            filePath: record.sourcePath,
          })
        }
        nextContent = result.after
        referenceCount += result.referenceCount
      }
      if (referenceCount === 0 || nextContent === snapshot.content) {
        continue
      }

      rewrites.push({
        filePath: sourcePath,
        kind: 'scene',
        referenceCount,
        before: snapshot.content,
        after: nextContent,
        source: snapshot.source,
        baselineRevision: snapshot.baselineRevision,
        metadata: snapshot.metadata,
      })
      rollbackFiles.push({
        filePath: sourcePath,
        kind: 'scene',
        snapshotContent: snapshot.content,
        metadata: snapshot.metadata,
        source: snapshot.source,
        baselineRevision: snapshot.baselineRevision,
      })
      continue
    }

    if (sourceKind === 'game-config') {
      // eslint-disable-next-line no-await-in-loop -- 配置快照需要与 rewrites 顺序一一对应，便于失败回滚。
      const config = await deps.gameConfig.getConfig(gamePath)
      // eslint-disable-next-line no-await-in-loop -- baseline 必须绑定同一次 config 快照，避免确认窗口期间误用后续读取。
      const baselineRevision = await createGameConfigBaselineRevision(config)
      let nextConfig = cloneGameConfigEntries(config)
      let referenceCount = 0
      for (const pair of sourcePairs) {
        const result = rewriteGameConfig(
          asGameConfigReadResult(nextConfig, config.unmanagedLineCount),
          pair.sourceRecords,
          pair.oldReferencePath,
          pair.newReferencePath,
        )
        for (const record of result.unsupported) {
          blockedReasons.push({
            kind: 'unsupported-reference',
            i18nMessage: t => t('edit.pathOperation.errors.unsupportedReferenceConfigField', {
              fieldKey: record.fieldKey,
            }),
            filePath: record.sourcePath,
          })
        }
        nextConfig = result.config
        referenceCount += result.referenceCount
      }
      if (referenceCount === 0) {
        continue
      }

      rewrites.push({
        filePath: sourcePath,
        kind: 'game-config',
        referenceCount,
        before: JSON.stringify(config.entries),
        after: JSON.stringify(nextConfig.entries),
        source: 'disk',
        baselineRevision,
        config: nextConfig,
      })
      rollbackFiles.push({
        filePath: sourcePath,
        kind: 'game-config',
        snapshotContent: JSON.stringify(config.entries),
        config: cloneGameConfigEntries(config),
        source: 'disk',
        baselineRevision,
      })
      continue
    }

    for (const pair of sourcePairs) {
      for (const record of pair.sourceRecords) {
        blockedReasons.push({
          kind: 'unsupported-reference',
          i18nMessage: t => t('edit.pathOperation.errors.unsupportedReferenceSource', {
            sourceKind: record.sourceKind,
          }),
          filePath: record.sourcePath,
        })
      }
    }
  }

  return { rewrites, rollbackFiles }
}

async function validatePlanBaseline(deps: PathOperationDeps, plan: PathOperationPlan): Promise<void> {
  if (plan.kind === 'move' && await isExistingPath(deps, plan.targetPath)) {
    throw new PathOperationError(
      'stale-plan',
      t => t('edit.pathOperation.errors.stalePlan', {
        path: plan.targetPath,
      }),
    )
  }

  for (const file of plan.rollback.files) {
    // eslint-disable-next-line no-await-in-loop -- 乐观锁校验按 rollback 顺序短路，避免后续副作用基于过期计划继续推进。
    const currentRevision = await readCurrentBaselineRevision(deps, file)
    if (!isSameBaselineRevision(file.baselineRevision, currentRevision)) {
      throw new PathOperationError(
        'stale-plan',
        t => t('edit.pathOperation.errors.stalePlan', {
          path: file.filePath,
        }),
      )
    }
  }
}

function createBlockedPlanError(plan: PathOperationPlan): PathOperationError {
  return new PathOperationError(
    'blocked-plan',
    t => t('edit.pathOperation.errors.blockedPlan'),
    plan.blockedReasons,
  )
}

async function applyRewrite(
  deps: PathOperationDeps,
  rewrite: AssetReferenceRewrite,
  markDurableWriteApplied: () => void,
): Promise<void> {
  if (rewrite.kind === 'game-config') {
    const gamePath = deps.getGamePath()
    if (!gamePath || !rewrite.config) {
      return
    }

    await deps.gameConfig.setConfig(gamePath, rewrite.config)
    markDurableWriteApplied()
    return
  }

  if (!rewrite.metadata) {
    return
  }

  await deps.gameFs.writeDocumentFile(rewrite.filePath, encodeTextFile(rewrite.after, rewrite.metadata))
  markDurableWriteApplied()

  if (rewrite.source === 'editor-buffer' && rewrite.baselineRevision.kind === 'editor-buffer') {
    const applied = deps.editor.applySystemRefactor(
      rewrite.filePath,
      rewrite.after,
      rewrite.metadata,
      rewrite.baselineRevision.revision,
    )
    if (!applied) {
      throw new PathOperationError(
        'stale-plan',
        t => t('edit.pathOperation.errors.editorContentChanged', {
          path: rewrite.filePath,
        }),
      )
    }
  }
}

async function rollbackRewrite(
  deps: PathOperationDeps,
  file: PlanRollbackContext['files'][number],
): Promise<void> {
  if (file.kind === 'game-config') {
    const gamePath = deps.getGamePath()
    if (!gamePath || !file.config) {
      return
    }

    await deps.gameConfig.setConfig(gamePath, file.config)
    return
  }

  if (!file.metadata) {
    return
  }

  await deps.gameFs.writeDocumentFile(file.filePath, encodeTextFile(file.snapshotContent, file.metadata))
  if (file.source === 'editor-buffer' && file.baselineRevision.kind === 'editor-buffer') {
    const expectedRevision = deps.editor.peekSceneRevision(file.filePath) ?? file.baselineRevision.revision
    const reverted = deps.editor.applySystemRefactor(
      file.filePath,
      file.snapshotContent,
      file.metadata,
      expectedRevision,
    )
    if (!reverted) {
      throw new PathOperationError(
        'stale-plan',
        t => t('edit.pathOperation.errors.editorContentChanged', {
          path: file.filePath,
        }),
      )
    }
  }
}

async function rollbackPathSideEffect(
  deps: PathOperationDeps,
  plan: PathOperationPlan,
  finalPath: AbsPath,
): Promise<void> {
  if (plan.kind === 'rename') {
    await deps.gameFs.renameFile(finalPath, AbsPath.basename(plan.sourcePath))
    return
  }

  await deps.gameFs.moveFile(finalPath, AbsPath.parent(plan.sourcePath), AbsPath.basename(plan.sourcePath))
}

async function rollbackStorePathMutation(
  deps: PathOperationDeps,
  plan: PathOperationPlan,
  finalPath: AbsPath,
): Promise<void> {
  await deps.fileStore.applyPathMutation(finalPath, plan.sourcePath)
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function logRollbackWarnings(warnings: readonly string[]): void {
  if (warnings.length === 0) {
    return
  }

  try {
    void logger.error(`路径操作回滚不完整: ${warnings.join('; ')}`).catch(() => undefined)
  } catch {
    // 日志通道不可用时不能影响原始路径操作错误的传播。
  }
}

async function rollbackAppliedSideEffects(
  deps: PathOperationDeps,
  plan: PathOperationPlan,
  appliedRewriteFiles: readonly PlanRollbackContext['files'][number][],
  finalPath: AbsPath,
  pathMutationApplied: boolean,
  sceneHistoryMigration?: SceneHistoryMigrationContext,
): Promise<string[]> {
  const warnings: string[] = []

  for (const file of appliedRewriteFiles.toReversed()) {
    try {
      // eslint-disable-next-line no-await-in-loop -- 回滚必须逆序执行，保持与已应用副作用相反的恢复顺序。
      await rollbackRewrite(deps, file)
    } catch (error) {
      warnings.push(`回滚引用文件失败: ${file.filePath}: ${toErrorMessage(error)}`)
    }
  }

  let pathSideEffectRolledBack = false
  try {
    await rollbackPathSideEffect(deps, plan, finalPath)
    pathSideEffectRolledBack = true
  } catch (error) {
    warnings.push(`回滚路径副作用失败: ${finalPath} -> ${plan.sourcePath}: ${toErrorMessage(error)}`)
  }

  if (pathSideEffectRolledBack) {
    try {
      if (pathMutationApplied) {
        await rollbackStorePathMutation(deps, plan, finalPath)
      }
    } catch (error) {
      warnings.push(`回滚路径状态失败: ${finalPath} -> ${plan.sourcePath}: ${toErrorMessage(error)}`)
    }
  }

  if (sceneHistoryMigration) {
    try {
      await deps.history.migrateSceneHistory({
        projectPath: sceneHistoryMigration.projectPath,
        oldLogicalPath: sceneHistoryMigration.newLogicalPath,
        newLogicalPath: sceneHistoryMigration.oldLogicalPath,
      })
    } catch (error) {
      warnings.push(
        `回滚场景历史失败: ${sceneHistoryMigration.newLogicalPath} -> ${sceneHistoryMigration.oldLogicalPath}: ${toErrorMessage(error)}`,
      )
    }
  }

  return warnings
}

async function refreshRewrittenMetadata(deps: PathOperationDeps, rewrites: readonly AssetReferenceRewrite[]): Promise<void> {
  const scenePaths = new Set(
    rewrites
      .filter(rewrite => rewrite.kind === 'scene')
      .map(rewrite => rewrite.filePath),
  )

  await Promise.all([...scenePaths].map(path => deps.fileStore.refreshItemMetadata(path)))
}

function emitPathOperationEvent(
  deps: PathOperationDeps,
  plan: PathOperationPlan,
  finalPath: AbsPath,
  isDir: boolean,
): void {
  const event: FileSystemEvent = isDir
    ? {
        type: 'directory:renamed',
        oldPath: plan.sourcePath,
        newPath: finalPath,
        source: 'system-refactor',
      }
    : {
        type: 'file:renamed',
        oldPath: plan.sourcePath,
        newPath: finalPath,
        source: 'system-refactor',
      }

  deps.fileSystemEvents.emit(event)
}

function emitRewriteEvents(deps: PathOperationDeps, rewrites: readonly AssetReferenceRewrite[]): void {
  const scenePaths = new Set(
    rewrites
      .filter(rewrite => rewrite.kind === 'scene')
      .map(rewrite => rewrite.filePath),
  )

  for (const path of scenePaths) {
    deps.fileSystemEvents.emit({
      type: 'file:modified',
      path,
      source: 'system-refactor',
    })
  }
}

function isSceneHistoryPath(logicalPath: RelPath): boolean {
  return logicalPath === RelPath.from('game/scene') || logicalPath.startsWith('game/scene/')
}

async function migrateSceneHistory(
  deps: PathOperationDeps,
  sourcePath: AbsPath,
  targetPath: AbsPath,
): Promise<{
  context?: SceneHistoryMigrationContext
  warnings: PathOperationWarning[]
}> {
  const gamePath = deps.getGamePath()
  if (!gamePath) {
    return { warnings: [] }
  }

  let oldLogicalPath: RelPath
  let newLogicalPath: RelPath
  try {
    oldLogicalPath = AbsPath.relativize(sourcePath, gamePath)
    newLogicalPath = AbsPath.relativize(targetPath, gamePath)
  } catch {
    return { warnings: [] }
  }

  if (!isSceneHistoryPath(oldLogicalPath) && !isSceneHistoryPath(newLogicalPath)) {
    return { warnings: [] }
  }

  try {
    await deps.history.migrateSceneHistory({
      projectPath: gamePath,
      oldLogicalPath,
      newLogicalPath,
    })
    return {
      context: {
        projectPath: gamePath,
        oldLogicalPath,
        newLogicalPath,
      },
      warnings: [],
    }
  } catch (error) {
    return {
      warnings: [
        {
          i18nMessage: t => t('edit.pathOperation.warnings.sceneHistoryMigrationFailed', {
            error: toErrorMessage(error),
            newPath: newLogicalPath,
            oldPath: oldLogicalPath,
          }),
        },
      ],
    }
  }
}

export function createPathOperationService(deps: PathOperationDeps) {
  async function plan(input: PathOperationInput): Promise<PathOperationPlan> {
    const targetPath = await resolveTargetPath(deps, input)
    const blockedReasons: PathOperationBlockReason[] = []
    const gamePath = deps.getGamePath()

    if (
      AbsPath.equals(input.sourcePath, targetPath)
      || (
        input.kind === 'rename'
        && await isExistingPath(deps, targetPath)
      )
    ) {
      blockedReasons.push({
        kind: 'duplicate-target',
        i18nMessage: t => t('edit.pathOperation.errors.duplicateTarget'),
        filePath: targetPath,
      })
    }

    if (deps.pathOperationRegistry.hasOverlap([input.sourcePath, targetPath])) {
      blockedReasons.push({
        kind: 'in-flight-conflict',
        i18nMessage: t => t('edit.pathOperation.errors.inFlightConflict', {
          path: input.sourcePath,
        }),
        filePath: input.sourcePath,
      })
    }

    const affectedAssets = gamePath
      ? resolveAffectedAssets(deps, gamePath, input.sourcePath, targetPath)
      : { entries: [], blocked: false }

    if (affectedAssets.blocked) {
      blockedReasons.push({
        kind: 'cross-root-move',
        i18nMessage: t => t('edit.pathOperation.errors.crossRootMove'),
        filePath: input.sourcePath,
      })
    }

    const rewrites = gamePath && affectedAssets.entries.length > 0
      ? await buildReferenceRewrites(
          deps,
          gamePath,
          affectedAssets.entries.map(entry => ({
            records: deps.resourceIndex.getReferencesTo(entry.sourceAsset.key),
            oldReferencePath: entry.sourceAsset.key.relativePath,
            newReferencePath: entry.targetKey.relativePath,
          })),
          blockedReasons,
        )
      : { rewrites: [], rollbackFiles: [] }

    return {
      kind: input.kind,
      sourcePath: input.sourcePath,
      targetPath,
      rewrites: rewrites.rewrites,
      blockedReasons,
      rollback: {
        files: rewrites.rollbackFiles,
      },
    }
  }

  async function apply(plan: PathOperationPlan): Promise<PathOperationResult> {
    if (plan.blockedReasons.length > 0) {
      throw createBlockedPlanError(plan)
    }

    const pendingId = deps.pathOperationRegistry.register({
      sourcePath: plan.sourcePath,
      targetPath: plan.targetPath,
    })
    const isDir = deps.fileStore.getItemByPath(plan.sourcePath)?.isDir ?? false
    const appliedRewriteFiles: PlanRollbackContext['files'] = []
    let appliedFsResult: PathMutationResult | undefined
    let sceneHistoryMigration: SceneHistoryMigrationContext | undefined
    let pathMutationApplied = false
    let pathMutationFailed = false
    const gamePath = deps.getGamePath()
    const warnings: PathOperationWarning[] = []
    const startedAt = Date.now()
    const rewriteCount = plan.rewrites.length
    const referenceCount = plan.rewrites.reduce((total, rewrite) => total + rewrite.referenceCount, 0)
    logger.debug(
      `[PathOperation] 开始执行: ${plan.kind} ${plan.sourcePath} -> ${plan.targetPath}, `
      + `重写文件 ${rewriteCount} 个, 引用 ${referenceCount} 处`,
    )

    try {
      await validatePlanBaseline(deps, plan)

      const fsResult = plan.kind === 'rename'
        ? await deps.gameFs.renameFile(plan.sourcePath, AbsPath.basename(plan.targetPath))
        : await deps.gameFs.moveFile(
            plan.sourcePath,
            AbsPath.parent(plan.targetPath),
            AbsPath.basename(plan.targetPath),
          )
      appliedFsResult = fsResult

      deps.pathOperationRegistry.updateChannel(pendingId, {
        echoMode: fsResult.echoMode,
        expectedEchoes: fsResult.echoMode === 'watcher' ? 1 : 0,
      })

      if (!AbsPath.equals(fsResult.newPath, plan.targetPath)) {
        throw new PathOperationError(
          'blocked-plan',
          t => t('edit.pathOperation.errors.targetPathMismatch', {
            path: fsResult.newPath,
          }),
        )
      }

      for (const [index, rewrite] of plan.rewrites.entries()) {
        const rollbackFile = plan.rollback.files[index]
        // eslint-disable-next-line no-await-in-loop -- 写入与 rollback 记录必须同步推进，失败时只回滚已成功项。
        await applyRewrite(deps, rewrite, () => {
          if (rollbackFile) {
            appliedRewriteFiles.push(rollbackFile)
          }
        })
      }

      try {
        await deps.fileStore.applyPathMutation(plan.sourcePath, fsResult.newPath)
        pathMutationApplied = true
      } catch (error) {
        pathMutationFailed = true
        try {
          await deps.fileStore.invalidatePathOperationCaches(plan.sourcePath, fsResult.newPath)
        } catch (invalidateError) {
          const message = toErrorMessage(invalidateError)
          try {
            await logger.warn(`[PathOperation] 失效路径缓存失败: ${message}`)
          } catch {
            // 日志通道不可用时不覆盖原始 mutation 错误。
          }
        } finally {
          const affectedDirectories = new Set([AbsPath.parent(plan.sourcePath), AbsPath.parent(fsResult.newPath)])
          for (const directoryPath of affectedDirectories) {
            deps.fileSystemEvents.emit({
              type: 'directory:modified',
              path: directoryPath,
              source: 'system-refactor',
            })
          }
        }
        throw error
      }

      await refreshRewrittenMetadata(deps, plan.rewrites)

      if (gamePath) {
        const rewrittenScenePaths = new Set(
          plan.rewrites
            .filter(rewrite => rewrite.kind === 'scene')
            .map(rewrite => rewrite.filePath),
        )
        const backupWarnings = await Promise.all([...rewrittenScenePaths].map(async (scenePath): Promise<PathOperationWarning | undefined> => {
          try {
            const logicalPath = AbsPath.relativize(scenePath, gamePath)
            await backupManager.createSystemRefactorBackup(gamePath, logicalPath)
            return
          } catch (error) {
            return {
              i18nMessage: t => t('edit.pathOperation.warnings.sceneBackupCreationFailed', {
                error: toErrorMessage(error),
                path: scenePath,
              }),
            } satisfies PathOperationWarning
          }
        }))
        warnings.push(...backupWarnings.filter((warning): warning is PathOperationWarning => warning !== undefined))
      }

      const historyMigration = await migrateSceneHistory(
        deps,
        plan.sourcePath,
        fsResult.newPath,
      )
      sceneHistoryMigration = historyMigration.context
      warnings.push(...historyMigration.warnings)

      if (gamePath) {
        await deps.gameManager.refreshRegisteredGameSnapshot(gamePath)
      }
      emitPathOperationEvent(deps, plan, fsResult.newPath, isDir)
      emitRewriteEvents(deps, plan.rewrites)

      deps.pathOperationRegistry.markSettled(pendingId)
      if (fsResult.echoMode === 'synthetic') {
        deps.pathOperationRegistry.release(pendingId)
      }
      logger.info(
        `[PathOperation] 执行完成: ${plan.kind} ${plan.sourcePath} -> ${fsResult.newPath}, `
        + `重写文件 ${rewriteCount} 个, 警告 ${warnings.length} 个, 耗时 ${Date.now() - startedAt}ms`,
      )

      return {
        plan,
        cancelled: false,
        finalPath: fsResult.newPath,
        warnings,
      }
    } catch (error) {
      try {
        const shouldRollbackPathSideEffect = !!appliedFsResult && !pathMutationFailed
        if (appliedFsResult && shouldRollbackPathSideEffect) {
          const warnings = await rollbackAppliedSideEffects(
            deps,
            plan,
            appliedRewriteFiles,
            appliedFsResult.newPath,
            pathMutationApplied,
            sceneHistoryMigration,
          )
          logRollbackWarnings(warnings)
        }
      } finally {
        deps.pathOperationRegistry.release(pendingId)
      }
      logger.warn(
        `[PathOperation] 执行失败: ${plan.kind} ${plan.sourcePath} -> ${plan.targetPath}, `
        + `已应用文件变更 ${appliedFsResult ? '是' : '否'}, 耗时 ${Date.now() - startedAt}ms - ${toErrorMessage(error)}`,
      )
      throw error
    }
  }

  async function perform(
    input: PathOperationInput,
    confirm: (plan: PathOperationPlan) => Promise<PathOperationConfirmDecision> = async () => 'cancel',
  ): Promise<PathOperationResult> {
    const operationPlan = await plan(input)
    if (operationPlan.blockedReasons.length > 0) {
      throw createBlockedPlanError(operationPlan)
    }

    const confirmedPlan = operationPlan.rewrites.length > 0
      ? await resolveConfirmedPlan(operationPlan, confirm)
      : operationPlan

    if (!confirmedPlan) {
      return {
        plan: operationPlan,
        cancelled: true,
        finalPath: operationPlan.targetPath,
        warnings: [],
      }
    }

    try {
      return await apply(confirmedPlan)
    } catch (error) {
      if (error instanceof PathOperationError && error.code === 'stale-plan') {
        logger.debug(`[PathOperation] 计划过期，重新规划: ${input.kind} ${input.sourcePath}`)
        const nextPlan = await plan(input)
        if (nextPlan.blockedReasons.length > 0) {
          throw createBlockedPlanError(nextPlan)
        }

        const confirmedNextPlan = nextPlan.rewrites.length > 0
          ? await resolveConfirmedPlan(nextPlan, confirm)
          : nextPlan

        if (!confirmedNextPlan) {
          return {
            plan: nextPlan,
            cancelled: true,
            finalPath: nextPlan.targetPath,
            warnings: [],
          }
        }
        return await apply(confirmedNextPlan)
      }

      throw error
    }
  }

  return {
    plan,
    apply,
    perform,
  }
}

async function resolveConfirmedPlan(
  operationPlan: PathOperationPlan,
  confirm: (plan: PathOperationPlan) => Promise<PathOperationConfirmDecision>,
): Promise<PathOperationPlan | undefined> {
  const decision = await confirm(operationPlan)
  if (decision === 'cancel') {
    return
  }

  if (decision === 'rewrite') {
    return operationPlan
  }

  return {
    ...operationPlan,
    rewrites: [],
    rollback: {
      files: [],
    },
  }
}

export const pathOperation = createPathOperationService({
  editor: {
    peekSceneBuffer(path) {
      return useEditorStore().peekSceneBuffer(path)
    },
    peekSceneRevision(path) {
      return useEditorStore().peekSceneRevision(path)
    },
    applySystemRefactor(path, content, metadata, expectedRevision) {
      return useEditorStore().applySystemRefactor(path, content, metadata, expectedRevision)
    },
  },
  fileStore: {
    applyPathMutation(sourcePath, newPath) {
      return useFileStore().applyPathMutation(sourcePath, newPath)
    },
    getItemByPath(path) {
      return useFileStore().getItemByPath(path)
    },
    invalidatePathOperationCaches(oldPath, newPath) {
      return useFileStore().invalidatePathOperationCaches(oldPath, newPath)
    },
    refreshItemMetadata(path) {
      return useFileStore().refreshItemMetadata(path)
    },
  },
  fileSystemEvents: useFileSystemEvents(),
  gameConfig: {
    getConfig: gameCmds.getGameConfig,
    setConfig: gameCmds.setGameConfig,
  },
  gameFs,
  gameManager,
  getGamePath() {
    const workspaceStore = useWorkspaceStore()
    return workspaceStore.currentGame?.path ?? (workspaceStore.CWD ? AbsPath.from(workspaceStore.CWD) : undefined)
  },
  history: {
    migrateSceneHistory({ projectPath, oldLogicalPath, newLogicalPath }) {
      return backupManager.moveSceneHistory(projectPath, oldLogicalPath, newLogicalPath)
    },
  },
  pathOperationRegistry,
  resourceIndex: useResourceIndex(),
})
