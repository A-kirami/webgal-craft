import { exists, mkdir } from '@tauri-apps/plugin-fs'

import { fsCmds } from '~/commands/fs'
import { findGameConfigEntryValue, gameCmds } from '~/commands/game'
import { projectConfigCmds } from '~/commands/project-config'
import { vfsCmds } from '~/commands/vfs'
import { db } from '~/database/db'
import { AbsPath, RelPath } from '~/domain/path'
import {
  assertEngineEditorCompatible,
  engineManager,
  evaluateEngineEditorCompatibility,
  isEngineEditorCompatible,
  isEngineUsable,
} from '~/services/engine-manager'
import { gameConfigPath, gameCoverPath, projectConfigPath } from '~/services/platform/app-paths'
import { resolveGameIconPreviewPath as resolveProjectIconPreviewPath } from '~/services/project-icon-assets'
import {
  classifyAvailability,
  createWarning,
  normalizeImportPath,
  ResourceHealthResult,
  ResourceWarning,
} from '~/services/resource-health'
import { toLookupPathKey } from '~/services/resource-path/lookup'
import { templateSwitch } from '~/services/template-switch'
import { useResourceStore } from '~/stores/resource'
import { useRuntimeTaskStore } from '~/stores/runtime-task'
import { useWorkspaceStore } from '~/stores/workspace'
import { AppError } from '~/types/errors'

import type { GameConfigEntry } from '~/commands/game'
import type { Engine, Game, Template } from '~/database/model'
import type { GameIconPathExistsContext } from '~/services/project-icon-assets'
import type { LookupPathKey } from '~/services/resource-path/lookup'
import type { GameMetadata, GamePreviewAssets, PreviewAsset } from '~/services/types'
import type {
  ImportDependencyResolutionContext,
  ImportDependencyResolutionResult,
  ImportTemplateResolutionResult,
  ResolveImportDependencies,
} from '~/types/import-dependency-resolution'
import type {
  PreparedManagedImport,
  PrepareManagedImportResult,
} from '~/types/managed-import'
import type { EngineRef, ProjectConfig, TemplateBinding } from '~/types/project-config'
import type { StaticSiteConfig } from '~/types/server'

interface RegisterGameOptions {
  engineId?: string
  metadata?: GameMetadata
  previewAssets?: GamePreviewAssets
  status?: Game['status']
}

interface ImportGameOptions {
  resolveDependencies?: ResolveImportDependencies
}

interface ManagedGameImportPlan {
  inspection: GameInspectionPayload
  hasProjectConfig: boolean
}

export type PreparedGameManagedImport = PreparedManagedImport<ManagedGameImportPlan>

export type GamePreviewAssetKey = keyof GamePreviewAssets
export type GamePreviewInvalidation = GamePreviewAssetKey | 'all'

export interface GamePreviewRefreshOptions {
  invalidate?: GamePreviewInvalidation
}

export interface GameInspectionPayload {
  metadata: GameMetadata
  previewAssets: GamePreviewAssets
}

type MonotonicGamePatch = Partial<Pick<Game, 'previewAssets'>> & { lastModified: number }
type MonotonicGamePatchSource = MonotonicGamePatch | ((game: Game) => MonotonicGamePatch)

const GAME_NAME_RAW_KEY = 'Game_name'
const GAME_KEY_RAW_KEY = 'Game_key'
const TITLE_IMAGE_RAW_KEY = 'Title_img'
const DEFAULT_GAME_ICON_PREVIEW_PATH = 'icons/favicon.ico'

interface GamePreviewLookupResult {
  iconPath: string
  iconExists: boolean
}

function mergeGameConfigEntries(
  entries: readonly GameConfigEntry[],
  nextEntries: readonly GameConfigEntry[],
): GameConfigEntry[] {
  const nextEntryValueMap = new Map(nextEntries.map(entry => [entry.key, entry.value]))
  const writtenKeys = new Set<string>()
  const mergedEntries = entries.map((entry) => {
    const nextValue = nextEntryValueMap.get(entry.key)
    if (nextValue === undefined) {
      return { ...entry }
    }

    writtenKeys.add(entry.key)
    return {
      key: entry.key,
      value: nextValue,
    }
  })

  for (const entry of nextEntries) {
    if (writtenKeys.has(entry.key)) {
      continue
    }

    mergedEntries.push({ ...entry })
  }

  return mergedEntries
}

function normalizeLogicalAssetPath(path: string | undefined): string | undefined {
  return path ? RelPath.from(path) : undefined
}

function buildGamePreviewAssets(iconPath: string, titleImage: string | undefined): GamePreviewAssets {
  const normalizedTitle = normalizeLogicalAssetPath(titleImage)
  return {
    icon: {
      path: iconPath,
    },
    cover: {
      path: normalizedTitle ? `game/background/${normalizedTitle}` : '',
    },
  }
}

function buildGameIconLookupResult(iconPath: RelPath | undefined): GamePreviewLookupResult {
  if (iconPath) {
    return {
      iconPath,
      iconExists: true,
    }
  }

  return {
    iconPath: DEFAULT_GAME_ICON_PREVIEW_PATH,
    iconExists: false,
  }
}

async function resolvePhysicalGameIconPreviewPath(rootPath: AbsPath): Promise<GamePreviewLookupResult> {
  return buildGameIconLookupResult(await resolveProjectIconPreviewPath(rootPath))
}

async function resolveGameIconPreviewPath(gamePath: AbsPath): Promise<GamePreviewLookupResult> {
  const site = await resolveStaticAssetSiteForIconLookup(gamePath)

  return buildGameIconLookupResult(await resolveProjectIconPreviewPath(
    gamePath,
    { pathExists: context => gameIconPathExists(context, site) },
  ))
}

async function resolveStaticAssetSiteForIconLookup(gamePath: AbsPath): Promise<StaticSiteConfig | undefined> {
  try {
    return await resolveStaticAssetSite({ path: gamePath })
  } catch {
    return undefined
  }
}

async function gameIconPathExists(context: GameIconPathExistsContext, site: StaticSiteConfig | undefined): Promise<boolean> {
  if (!site?.enginePath) {
    return exists(context.absolutePath)
  }

  try {
    await vfsCmds.resolvePath({
      projectPath: site.projectPath,
      enginePath: site.enginePath,
      templatePath: site.templatePath,
      relPath: context.relativePath,
    })
    return true
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') {
      return false
    }

    throw error
  }
}

async function validateGame(gamePath: AbsPath): Promise<boolean> {
  return exists(gameConfigPath(gamePath))
}

async function getGameMetadata(gamePath: AbsPath): Promise<GameMetadata> {
  const gameConfig = await gameCmds.getGameConfig(gamePath)

  return {
    name: findGameConfigEntryValue(gameConfig.entries, GAME_NAME_RAW_KEY) ?? '',
    titleImg: findGameConfigEntryValue(gameConfig.entries, TITLE_IMAGE_RAW_KEY) ?? '',
  }
}

function withGamePreviewCacheVersion(
  previewAssets: GamePreviewAssets,
  cacheVersion: number = Date.now(),
): GamePreviewAssets {
  return {
    icon: {
      ...previewAssets.icon,
      cacheVersion,
    },
    cover: {
      ...previewAssets.cover,
      cacheVersion,
    },
  }
}

function isPreviewAssetInvalidated(key: GamePreviewAssetKey, invalidation: GamePreviewInvalidation | undefined): boolean {
  return invalidation === 'all' || invalidation === key
}

function mergeGamePreviewInvalidation(
  current: GamePreviewInvalidation | undefined,
  next: GamePreviewInvalidation | undefined,
): GamePreviewInvalidation | undefined {
  if (!current) {
    return next
  }

  if (!next) {
    return current
  }

  if (current === next) {
    return current
  }

  return 'all'
}

function mergePreviewAsset(
  previous: PreviewAsset,
  next: PreviewAsset,
  invalidated: boolean,
  cacheVersion: number,
): PreviewAsset {
  if (invalidated || previous.path !== next.path) {
    return {
      ...next,
      cacheVersion,
    }
  }

  return {
    ...next,
    cacheVersion: previous.cacheVersion,
  }
}

function mergeGamePreviewAssets(
  previous: GamePreviewAssets,
  next: GamePreviewAssets,
  options: GamePreviewRefreshOptions | undefined,
  cacheVersion: number,
): GamePreviewAssets {
  return {
    icon: mergePreviewAsset(
      previous.icon,
      next.icon,
      isPreviewAssetInvalidated('icon', options?.invalidate),
      cacheVersion,
    ),
    cover: mergePreviewAsset(
      previous.cover,
      next.cover,
      isPreviewAssetInvalidated('cover', options?.invalidate),
      cacheVersion,
    ),
  }
}

async function getGamePreviewAssets(gamePath: AbsPath): Promise<GamePreviewAssets> {
  const [metadata, iconLookup] = await Promise.all([
    getGameMetadata(gamePath),
    resolveGameIconPreviewPath(gamePath),
  ])
  return buildGamePreviewAssets(iconLookup.iconPath, metadata.titleImg)
}

async function getGameSnapshot(gamePath: AbsPath): Promise<Pick<Game, 'metadata' | 'previewAssets'>> {
  const [metadata, iconLookup] = await Promise.all([
    getGameMetadata(gamePath),
    resolveGameIconPreviewPath(gamePath),
  ])
  const cacheVersion = Date.now()

  return {
    metadata,
    previewAssets: withGamePreviewCacheVersion(
      buildGamePreviewAssets(iconLookup.iconPath, metadata.titleImg),
      cacheVersion,
    ),
  }
}

function applyCurrentGamePatch(
  gameId: string,
  patch: Partial<Pick<Game, 'engineId' | 'lastModified' | 'metadata' | 'previewAssets'>>,
) {
  const workspaceStore = useWorkspaceStore()
  if (!workspaceStore.currentGame || workspaceStore.currentGame.id !== gameId) {
    return
  }

  const current = workspaceStore.currentGame
  const lastModified = patch.lastModified === undefined
    ? current.lastModified
    : Math.max(current.lastModified, patch.lastModified)
  workspaceStore.currentGame = {
    ...current,
    ...patch,
    lastModified,
    metadata: { ...current.metadata, ...patch.metadata },
    previewAssets: { ...current.previewAssets, ...patch.previewAssets },
  }
}

async function updateGameMonotonicLastModified(
  gameId: string,
  patch: MonotonicGamePatchSource,
): Promise<void> {
  const appliedPatch = await db.transaction('rw', db.games, async () => {
    const game = await db.games.get(gameId)
    if (!game) {
      return
    }

    const rawPatch = typeof patch === 'function' ? patch(game) : patch
    const lastModified = Math.max(game.lastModified, rawPatch.lastModified)
    const nextPatch: Partial<Pick<Game, 'lastModified' | 'previewAssets'>> = {
      ...rawPatch,
      lastModified,
    }
    await db.games.update(gameId, nextPatch)
    return nextPatch
  })

  if (appliedPatch) {
    applyCurrentGamePatch(gameId, appliedPatch)
  }
}

async function updateRegisteredGameSnapshot(
  gamePath: AbsPath,
  snapshot: Pick<Game, 'metadata' | 'previewAssets'>,
  options: GamePreviewRefreshOptions | undefined,
  snapshotVersion: number,
): Promise<void> {
  const pathLookupKey = toLookupPathKey(gamePath)
  const appliedUpdate = await db.transaction('rw', db.games, async () => {
    const game = await db.games.where('pathLookupKey').equals(pathLookupKey).first()
    if (!game) {
      return
    }

    const patch: Partial<Pick<Game, 'lastModified' | 'metadata' | 'previewAssets'>> = {
      lastModified: Math.max(game.lastModified, snapshotVersion),
      metadata: snapshot.metadata,
      previewAssets: mergeGamePreviewAssets(game.previewAssets, snapshot.previewAssets, options, snapshotVersion),
    }
    await db.games.update(game.id, patch)
    return {
      gameId: game.id,
      patch,
    }
  })

  if (appliedUpdate) {
    applyCurrentGamePatch(appliedUpdate.gameId, appliedUpdate.patch)
  }
}

async function refreshRegisteredGameSnapshot(gamePath: AbsPath, options?: GamePreviewRefreshOptions): Promise<void> {
  const game = await db.games.where('pathLookupKey').equals(toLookupPathKey(gamePath)).first()
  if (!game) {
    return
  }

  const snapshot = await getGameSnapshot(gamePath)
  const snapshotVersion = Date.now()
  await updateRegisteredGameSnapshot(gamePath, snapshot, options, snapshotVersion)
}

async function registerGame(
  gamePath: AbsPath,
  options: RegisterGameOptions = {},
): Promise<string> {
  const { engineId, status = 'created' } = options
  let { metadata, previewAssets } = options

  if (!metadata && !previewAssets) {
    const snapshot = await getGameSnapshot(gamePath)
    metadata = snapshot.metadata
    previewAssets = snapshot.previewAssets
  } else {
    metadata ??= await getGameMetadata(gamePath)
    previewAssets ??= withGamePreviewCacheVersion(await getGamePreviewAssets(gamePath))
  }

  return db.games.add({
    id: crypto.randomUUID(),
    path: gamePath,
    pathLookupKey: toLookupPathKey(gamePath),
    engineId,
    createdAt: Date.now(),
    lastModified: Date.now(),
    status,
    availability: 'available',
    metadata,
    previewAssets,
  })
}

function buildProjectEngineRef(engine: Pick<Engine, 'engineId' | 'version'>): EngineRef {
  return {
    id: engine.engineId,
    version: engine.version,
  }
}

async function readProjectConfigSafe(gamePath: AbsPath): Promise<ProjectConfig | undefined> {
  try {
    return await projectConfigCmds.readProjectConfig(gamePath)
  } catch (error) {
    logger.warn(`读取项目配置失败 (${gamePath}): ${error}`)
    return undefined
  }
}

async function resolveBoundEngine(
  game: Pick<Game, 'engineId' | 'path'>,
): Promise<{ config?: ProjectConfig, engine?: Engine }> {
  const config = await readProjectConfigSafe(game.path)

  if (game.engineId) {
    const engine = await db.engines.get(game.engineId)
    return { config, engine }
  }

  if (!config?.engine) {
    return { config }
  }

  const engine = await engineManager.findEngineByRef(config.engine)
  return { config, engine }
}

function assertBoundEngineFound(isEngineBound: boolean, engine: Engine | undefined): void {
  if (!isEngineBound || engine) {
    return
  }

  throw new AppError('IO_ERROR', '引擎不存在', {
    details: { reason: 'ENGINE_NOT_FOUND' },
  })
}

function assertBoundEngineEditorCompatible(isEngineBound: boolean, engine: Engine | undefined): void {
  assertBoundEngineFound(isEngineBound, engine)
  if (isEngineBound && engine) {
    assertEngineEditorCompatible(engine)
  }
}

async function resolveBoundTemplatePath(config: ProjectConfig | undefined, engine: Engine | undefined): Promise<AbsPath | undefined> {
  if (!config?.engine) {
    return undefined
  }

  return await templateSwitch.resolveTemplatePath(config.template, engine)
}

function buildImportDependencyContext(
  source: ImportDependencyResolutionContext['source'],
  metadata: GameMetadata,
): ImportDependencyResolutionContext {
  const gameName = metadata.name?.trim()
  return {
    ...(gameName ? { gameName } : {}),
    purpose: 'import',
    source,
  }
}

function formatTemplateBindingName(binding: TemplateBinding): string {
  switch (binding.kind) {
    case 'standalone': {
      return binding.name
    }
    case 'engineBuiltin': {
      return binding.engine.version
        ? `${binding.engine.id} ${binding.engine.version}`
        : binding.engine.id
    }
    default: {
      return binding satisfies never
    }
  }
}

async function resolveUsableEngine(engineId: string | undefined): Promise<Engine> {
  const engine = engineId
    ? await db.engines.get(engineId)
    : undefined
  if (!engine) {
    throw new AppError('IO_ERROR', '引擎不存在', {
      details: { reason: 'ENGINE_NOT_FOUND' },
    })
  }

  assertEngineEditorCompatible(engine)

  return engine
}

function isTemplateUsable(template: Template | undefined): template is Template {
  return template?.status === 'created' && template.availability === 'available'
}

async function findStandaloneTemplate(templateName: string): Promise<Template | undefined> {
  return db.templates
    .where('metadata.name')
    .equals(templateName)
    .first()
}

async function isTemplateBindingUsable(binding: TemplateBinding, engine?: Engine): Promise<boolean> {
  if (binding.kind === 'standalone') {
    return isTemplateUsable(await findStandaloneTemplate(binding.name))
  }

  const templatePath = await templateSwitch.resolveTemplatePath(binding, engine)
  return !!templatePath
}

async function assertTemplateDecisionUsable(
  decision: ImportTemplateResolutionResult | undefined,
  finalEngine: Engine,
): Promise<void> {
  if (!decision) {
    return
  }

  if (decision.action === 'followEngine') {
    const templatePath = await templateSwitch.resolveTemplatePath(undefined, finalEngine)
    if (!templatePath) {
      throw new AppError('MISSING_TEMPLATE', '项目引用的模板不存在或不可用', {
        details: { reason: 'TEMPLATE_UNAVAILABLE' },
      })
    }
    return
  }

  const { binding } = decision
  if (!(await isTemplateBindingUsable(binding, finalEngine))) {
    throw new AppError('MISSING_TEMPLATE', '项目引用的模板不存在或不可用', {
      details: {
        reason: 'TEMPLATE_UNAVAILABLE',
        templateName: formatTemplateBindingName(binding),
      },
    })
  }
}

async function resolveImportDependencyDecision(
  context: ImportDependencyResolutionContext,
  options: ImportGameOptions,
): Promise<ImportDependencyResolutionResult> {
  if (!context.engine && !context.template) {
    return {}
  }

  if (!options.resolveDependencies) {
    throw new AppError('IO_ERROR', '项目依赖需要修复，请重新导入并选择可用依赖', {
      details: {
        reason: context.engine ? 'ENGINE_SELECTION_REQUIRED' : 'TEMPLATE_SELECTION_REQUIRED',
      },
    })
  }

  const result = await options.resolveDependencies(context)
  if (!result) {
    throw new AppError('IO_ERROR', '导入已取消', {
      details: { reason: 'IMPORT_CANCELLED' },
    })
  }

  if (context.template && !result.template) {
    throw new AppError('MISSING_TEMPLATE', '项目引用的模板不存在或不可用', {
      details: {
        reason: 'TEMPLATE_SELECTION_REQUIRED',
        templateName: context.template.displayName,
      },
    })
  }

  return result
}

function applyTemplateDecision(
  config: ProjectConfig,
  decision: ImportTemplateResolutionResult | undefined,
): ProjectConfig {
  if (!decision) {
    return config
  }

  if (decision.action === 'set') {
    return { ...config, template: decision.binding }
  }

  const { template: _template, ...nextConfig } = config
  return nextConfig
}

async function inspectTemplateDependencyIssue(
  binding: TemplateBinding,
): Promise<ImportDependencyResolutionContext['template']> {
  const displayName = formatTemplateBindingName(binding)

  if (binding.kind === 'standalone') {
    const template = await findStandaloneTemplate(binding.name)

    if (isTemplateUsable(template)) {
      return undefined
    }

    return {
      current: binding,
      displayName,
      reason: template ? 'unavailable' : 'missing',
    }
  }

  const engine = await engineManager.findEngineByRef(binding.engine)
  if (engine && isEngineUsable(engine) && await isTemplateBindingUsable(binding, engine)) {
    return undefined
  }

  return {
    current: binding,
    displayName,
    reason: engine ? 'unavailable' : 'missing',
  }
}

function buildConfiguredEngineIssue(
  engineRef: EngineRef,
  engine: Engine | undefined,
): ImportDependencyResolutionContext['engine'] {
  if (!engine) {
    return {
      current: engineRef,
      reason: 'missing',
    }
  }

  const compatibility = evaluateEngineEditorCompatibility(engine)
  if (compatibility.compatible) {
    return undefined
  }

  if (compatibility.issue === 'unavailable') {
    return {
      current: engineRef,
      reason: 'unavailable',
    }
  }

  return {
    compatibilityIssue: compatibility.issue,
    current: engineRef,
    reason: 'incompatible',
  }
}

async function importLegacyGame(
  gamePath: AbsPath,
  options: ImportGameOptions,
  inspection: GameInspectionPayload,
): Promise<string> {
  const context = buildImportDependencyContext('legacy', inspection.metadata)
  context.engine = {
    reason: 'selectionRequired',
  }
  const decision = await resolveImportDependencyDecision(context, options)
  const engine = await resolveUsableEngine(decision.engineId)

  await projectConfigCmds.writeProjectConfig(gamePath, {
    version: 1,
    engine: buildProjectEngineRef(engine),
  })

  return registerGame(gamePath, { ...inspection, engineId: engine.id })
}

async function importConfiguredGame(
  gamePath: AbsPath,
  options: ImportGameOptions,
  inspection: GameInspectionPayload,
): Promise<string> {
  let config: ProjectConfig

  try {
    config = await projectConfigCmds.readProjectConfig(gamePath)
  } catch (error) {
    // 仅处理 INVALID_PROJECT_CONFIG，其他错误（含 SCHEMA_VERSION_TOO_NEW）直接上抛
    if (!(error instanceof AppError) || error.code !== 'INVALID_PROJECT_CONFIG') {
      throw error
    }

    throw new AppError('INVALID_PROJECT_CONFIG', '项目配置文件损坏', {
      details: { reason: 'CONFIG_CORRUPTED' },
    })
  }

  let matchedEngine: Engine | undefined
  const context = buildImportDependencyContext('configured', inspection.metadata)

  if (config.engine) {
    matchedEngine = await engineManager.findEngineByRef(config.engine)
    context.engine = buildConfiguredEngineIssue(config.engine, matchedEngine)
    if (!context.engine && matchedEngine) {
      context.resolvedEngineId = matchedEngine.id
    }
  } else {
    logger.warn(`engine 字段缺失，引导用户选择兼容引擎: ${gamePath}`)
    context.engine = {
      reason: 'missing',
    }
  }

  if (config.template) {
    context.template = await inspectTemplateDependencyIssue(config.template)
  }

  const decision = await resolveImportDependencyDecision(context, options)
  const finalEngine = context.engine
    ? await resolveUsableEngine(decision.engineId)
    : matchedEngine
  const nextEngineRef = finalEngine ? buildProjectEngineRef(finalEngine) : undefined
  const templateDecision = context.template ? decision.template : undefined
  if (templateDecision && finalEngine) {
    await assertTemplateDecisionUsable(templateDecision, finalEngine)
  }

  let nextConfig = applyTemplateDecision(config, templateDecision)
  if (nextEngineRef) {
    nextConfig = {
      ...nextConfig,
      engine: nextEngineRef,
    }
  }

  if (context.engine || templateDecision) {
    await projectConfigCmds.writeProjectConfig(gamePath, nextConfig)
  }

  return registerGame(gamePath, { ...inspection, engineId: finalEngine?.id })
}

interface CreateGameOptions {
  onProgress?: (progress: number) => void
  templateBinding?: TemplateBinding
}

async function createGame(gameName: string, gamePath: AbsPath, engineId: string, options: CreateGameOptions = {}): Promise<string> {
  const resourceStore = useResourceStore()
  const engine = await db.engines.get(engineId)
  if (!engine) {
    throw new AppError('IO_ERROR', '引擎不存在')
  }

  assertEngineEditorCompatible(engine)

  const { templateBinding } = options

  const targetExisted = await exists(gamePath)
  const templateLabel = templateBinding ? formatTemplateBindingName(templateBinding) : '无'
  logger.info(
    `[游戏创建] 开始: 名称=${gameName}, 路径=${gamePath}, 引擎ID=${engineId}, `
    + `模板=${templateLabel}, 目标已存在=${targetExisted ? '是' : '否'}`,
  )
  let gameId: string | undefined
  const finishUpdateBlocker = useRuntimeTaskStore()
    .beginBlockingTask(`create-game:${crypto.randomUUID()}`)

  try {
    // 先创建目录和项目配置，确保 preview primer 触发时路径已存在且 VFS 可解析引擎层资源
    await mkdir(AbsPath.join(gamePath, RelPath.from('game')), { recursive: true })
    await projectConfigCmds.writeProjectConfig(gamePath, {
      version: 1,
      engine: buildProjectEngineRef(engine),
      ...(templateBinding ? { template: templateBinding } : {}),
    })

    // 读取引擎默认配置获取初始预览资源路径，使创建中也能通过引擎 serve URL 显示封面和图标
    const iconLookup = await resolvePhysicalGameIconPreviewPath(engine.path)
    let titleImg = ''
    try {
      const engineConfig = await gameCmds.getGameConfig(engine.path)
      titleImg = findGameConfigEntryValue(engineConfig.entries, TITLE_IMAGE_RAW_KEY) ?? ''
    } catch {
      // 引擎未提供默认 game/config.txt 时按空 titleImg 处理
    }
    const initialPreviewAssets = buildGamePreviewAssets(iconLookup.iconPath, titleImg)

    gameId = await registerGame(gamePath, {
      engineId,
      metadata: {
        name: gameName,
      },
      previewAssets: initialPreviewAssets,
      status: 'creating',
    })

    // 复制引擎 game/ 到项目（含 config.txt 等），但排除 template/：
    // 模板按 phase-4b/01 设计走 template lower，不再下沉到项目目录
    const engineGameDir = AbsPath.join(engine.path, RelPath.from('game'))
    if (await exists(engineGameDir)) {
      const projectGameDir = AbsPath.join(gamePath, RelPath.from('game'))
      await fsCmds.copyDirectoryWithProgress(
        engineGameDir,
        projectGameDir,
        (progress) => {
          resourceStore.updateProgress(gameId!, progress)
          options.onProgress?.(progress)
        },
        { excludes: ['template'] },
      )
    }

    const gameKey = crypto.randomUUID()
    const gameConfig = await gameCmds.getGameConfig(gamePath)
    await gameCmds.setGameConfig(gamePath, {
      entries: mergeGameConfigEntries(gameConfig.entries, [
        {
          key: GAME_NAME_RAW_KEY,
          value: gameName,
        },
        {
          key: GAME_KEY_RAW_KEY,
          value: gameKey,
        },
      ]),
    })

    const snapshot = await getGameSnapshot(gamePath)
    await db.games.update(gameId, {
      status: 'created',
      ...snapshot,
    })
    resourceStore.finishProgress(gameId)
    logger.info(
      `[游戏创建] 完成: ID=${gameId}, 名称=${gameName}, 路径=${gamePath}, `
      + `引擎ID=${engineId}, 模板=${templateLabel}`,
    )

    return gameId
  } catch (error) {
    logger.error(
      `[游戏创建] 失败: 记录ID=${gameId ?? '无'}, 名称=${gameName}, 路径=${gamePath}, `
      + `引擎ID=${engineId}, 模板=${templateLabel} - ${error}`,
    )
    if (gameId) {
      resourceStore.finishProgress(gameId)
      await db.games.delete(gameId).catch((error_) => {
        logger.warn(
          `[游戏创建] 清理异常 - 删除记录失败: ID=${gameId}, 名称=${gameName}, 路径=${gamePath}, `
          + `引擎ID=${engineId}, 模板=${templateLabel} - ${error_}`,
        )
      })
    }
    if (!targetExisted && await exists(gamePath)) {
      await fsCmds.deleteFile(gamePath, true).catch((error_) => {
        logger.warn(
          `[游戏创建] 清理异常 - 删除目录失败: 记录ID=${gameId ?? '无'}, 名称=${gameName}, 路径=${gamePath}, `
          + `引擎ID=${engineId}, 模板=${templateLabel} - ${error_}`,
        )
      })
    }
    throw error
  } finally {
    finishUpdateBlocker()
  }
}

export type GameFileRemoval = 'keep' | 'permanent' | 'trash'

async function deleteGame(game: Game, fileRemoval: GameFileRemoval = 'keep'): Promise<void> {
  if (fileRemoval === 'permanent') {
    await db.games.delete(game.id)
    try {
      await fsCmds.deleteFile(game.path, true)
    } catch (error) {
      await db.games.add(game)
      throw error
    }
    return
  }

  if (fileRemoval === 'trash') {
    await fsCmds.deleteFile(game.path, false)
  }
  await db.games.delete(game.id)
}

/**
 * 把游戏记录指向新的目录路径。第一版不做 gameKey 身份校验，只要新路径是合法游戏目录即可，
 * 对应的会话状态由调用方负责清理。
 */
async function relinkGame(gameId: string, newPath: AbsPath): Promise<Game> {
  const game = await db.games.get(gameId)
  if (!game) {
    throw new AppError('IO_ERROR', '游戏不存在')
  }

  const inspection = await inspectGame(newPath)
  if (inspection.availability !== 'available') {
    throw new AppError('INVALID_STRUCTURE', '所选目录不是合法的游戏文件夹')
  }

  const conflicting = await findRegisteredGameByPath(inspection.normalizedPath)
  if (conflicting && conflicting.id !== gameId) {
    throw new AppError('DUPLICATE_RESOURCE', '该目录已绑定到其他游戏记录')
  }

  const patch: Partial<Game> = {
    path: inspection.normalizedPath,
    pathLookupKey: inspection.lookupKey,
    availability: 'available',
    lastModified: Date.now(),
    ...inspection.payload,
  }
  await db.games.update(gameId, patch)

  return { ...game, ...patch }
}

async function prepareManagedImport(stagingPath: AbsPath): Promise<PrepareManagedImportResult<ManagedGameImportPlan>> {
  const { normalizedPath } = normalizeImportPath(stagingPath)
  const inspection = await inspectGame(normalizedPath)
  if (inspection.availability !== 'available' || !inspection.payload) {
    const { code, message, details } = inspection.blockingIssue!
    throw new AppError(code, message, { details })
  }

  return {
    kind: 'ready',
    prepared: {
      finalRelativePath: crypto.randomUUID(),
      plan: {
        inspection: inspection.payload,
        hasProjectConfig: await exists(projectConfigPath(normalizedPath)),
      },
    },
  }
}

async function registerManagedImport(
  finalPath: AbsPath,
  prepared: PreparedGameManagedImport,
  options: ImportGameOptions = {},
): Promise<{ id: string }> {
  const { normalizedPath } = normalizeImportPath(finalPath)
  const { inspection, hasProjectConfig } = prepared.plan
  const id = hasProjectConfig
    ? await importConfiguredGame(normalizedPath, options, inspection)
    : await importLegacyGame(normalizedPath, options, inspection)
  return { id }
}

async function prepareManagedRelink(
  existingGameId: string,
  stagingPath: AbsPath,
): Promise<PrepareManagedImportResult<ManagedGameImportPlan>> {
  const existing = await db.games.get(existingGameId)
  if (!existing) {
    throw new AppError('IO_ERROR', '游戏不存在')
  }

  return prepareManagedImport(stagingPath)
}

async function registerManagedRelink(
  existingGameId: string,
  finalPath: AbsPath,
  prepared: PreparedGameManagedImport,
): Promise<Game> {
  const { normalizedPath, lookupKey } = normalizeImportPath(finalPath)
  const game = await db.games.get(existingGameId)
  if (!game) {
    throw new AppError('IO_ERROR', '游戏不存在')
  }

  const conflicting = await findRegisteredGameByPath(normalizedPath)
  if (conflicting && conflicting.id !== existingGameId) {
    throw new AppError('DUPLICATE_RESOURCE', '该目录已绑定到其他游戏记录')
  }

  const patch: Partial<Game> = {
    path: normalizedPath,
    pathLookupKey: lookupKey,
    availability: 'available',
    lastModified: Date.now(),
    ...prepared.plan.inspection,
  }
  await db.games.update(existingGameId, patch)

  return { ...game, ...patch }
}

async function getGameEnginePath(game: Pick<Game, 'engineId' | 'path'>): Promise<AbsPath | undefined> {
  const { engine } = await resolveBoundEngine(game)
  if (!engine || !isEngineUsable(engine)) {
    return undefined
  }

  return engine.path
}

async function ensureConfigWritable(game: Pick<Game, 'engineId' | 'path'>): Promise<void> {
  const enginePath = await getGameEnginePath(game)
  if (!enginePath) {
    return
  }

  await vfsCmds.ensureWritable({
    projectPath: game.path,
    enginePath,
    relPath: RelPath.from('game/config.txt'),
  })
}

async function renameGame(id: string, newName: string): Promise<void> {
  const game = await db.games.get(id)
  if (!game) {
    throw new AppError('IO_ERROR', '游戏不存在')
  }

  await ensureConfigWritable(game)
  const gameConfig = await gameCmds.getGameConfig(game.path)
  await gameCmds.setGameConfig(game.path, {
    entries: mergeGameConfigEntries(gameConfig.entries, [
      {
        key: GAME_NAME_RAW_KEY,
        value: newName,
      },
    ]),
  })

  const patch = {
    lastModified: Date.now(),
    metadata: {
      name: newName,
    },
  }
  await db.games.update(id, patch)
  applyCurrentGamePatch(id, patch)
}

async function findRegisteredGameByPath(path: AbsPath): Promise<Game | undefined> {
  return db.games.where('pathLookupKey').equals(toLookupPathKey(path)).first()
}

function identityKeyOf(input: { path: AbsPath }): string {
  return toLookupPathKey(input.path)
}

async function collectGameWarnings(
  gamePath: AbsPath,
  metadata: GameMetadata,
  iconLookup: GamePreviewLookupResult,
): Promise<ResourceWarning[]> {
  const warnings: ResourceWarning[] = []

  if (!metadata.name?.trim()) {
    warnings.push(createWarning('missing-game-name', '游戏未配置 Game_name'))
  }

  if (!iconLookup.iconExists) {
    warnings.push(createWarning('missing-game-icon', '游戏图标不存在'))
  }

  const titleImg = normalizeLogicalAssetPath(metadata.titleImg?.trim())
  if (!titleImg) {
    warnings.push(createWarning('missing-title-image', '游戏未配置 Title_img'))
  } else if (!(await exists(gameCoverPath(gamePath, titleImg)))) {
    warnings.push(createWarning('missing-title-image-file', `Title_img 指向的文件不存在: ${titleImg}`))
  }

  return warnings
}

async function inspectGameStructure(
  normalizedPath: AbsPath,
  lookupKey: LookupPathKey,
): Promise<ResourceHealthResult<never> | undefined> {
  if (!(await exists(normalizedPath))) {
    return {
      availability: 'missing',
      warnings: [],
      blockingIssue: { code: 'DIR_NOT_FOUND', message: '游戏目录不存在' },
      normalizedPath,
      lookupKey,
    }
  }

  if (!(await exists(gameConfigPath(normalizedPath)))) {
    return {
      availability: 'broken',
      warnings: [],
      blockingIssue: { code: 'INVALID_STRUCTURE', message: '无效的游戏文件夹' },
      normalizedPath,
      lookupKey,
    }
  }
}

async function inspectGameSemantics(
  normalizedPath: AbsPath,
): Promise<GameInspectionPayload & { warnings: ResourceWarning[] }> {
  const [metadata, iconLookup] = await Promise.all([
    getGameMetadata(normalizedPath),
    resolveGameIconPreviewPath(normalizedPath),
  ])
  const warnings = await collectGameWarnings(normalizedPath, metadata, iconLookup)

  return {
    metadata,
    warnings,
    previewAssets: withGamePreviewCacheVersion(
      buildGamePreviewAssets(iconLookup.iconPath, metadata.titleImg),
    ),
  }
}

async function inspectGame(
  rawPath: AbsPath,
): Promise<ResourceHealthResult<GameInspectionPayload>> {
  const { normalizedPath, lookupKey } = normalizeImportPath(rawPath)

  const structureResult = await inspectGameStructure(normalizedPath, lookupKey)
  if (structureResult) {
    return structureResult
  }

  try {
    const payload = await inspectGameSemantics(normalizedPath)

    return {
      availability: classifyAvailability({
        pathExists: true,
        structureValid: true,
        semanticsValid: true,
      }),
      warnings: payload.warnings,
      payload: {
        metadata: payload.metadata,
        previewAssets: payload.previewAssets,
      },
      normalizedPath,
      lookupKey,
    }
  } catch (error) {
    return {
      availability: 'broken',
      warnings: [],
      blockingIssue: {
        code: 'INVALID_CONFIG',
        message: '游戏配置解析失败',
        details: { reason: 'PARSE_FAILED', parseError: String(error) },
      },
      normalizedPath,
      lookupKey,
    }
  }
}

export interface ImportGameResult {
  id: string
  alreadyRegistered: boolean
}

async function importGame(gamePath: AbsPath, options: ImportGameOptions = {}): Promise<ImportGameResult> {
  const { normalizedPath } = normalizeImportPath(gamePath)

  // 幂等：已注册路径直接返回既有 ID（按归一化后路径比较）
  // 即使目录已损坏也允许命中既有记录，由后续 reconcile 流程处理 availability
  const existing = await findRegisteredGameByPath(normalizedPath)
  if (existing) {
    return { id: existing.id, alreadyRegistered: true }
  }

  const inspection = await inspectGame(normalizedPath)
  if (inspection.availability !== 'available') {
    const { code, message, details } = inspection.blockingIssue!
    logger.warn(`[游戏导入] ${message}: ${normalizedPath}`)
    throw new AppError(code, message, { details })
  }

  const id = await exists(projectConfigPath(normalizedPath))
    ? await importConfiguredGame(normalizedPath, options, inspection.payload!)
    : await importLegacyGame(normalizedPath, options, inspection.payload!)
  return { id, alreadyRegistered: false }
}

async function resolvePreviewSite(game: Pick<Game, 'engineId' | 'path'>): Promise<StaticSiteConfig> {
  const { config, engine } = await resolveBoundEngine(game)
  const isEngineBound = !!game.engineId || !!config?.engine

  assertBoundEngineEditorCompatible(isEngineBound, engine)

  const templatePath = await resolveBoundTemplatePath(config, engine)

  return {
    projectPath: game.path,
    enginePath: engine?.path,
    templatePath,
  }
}

async function resolveStaticAssetSite(game: Pick<Game, 'engineId' | 'path'>): Promise<StaticSiteConfig> {
  const { config, engine } = await resolveBoundEngine(game)

  if (!engine || !isEngineEditorCompatible(engine)) {
    return {
      projectPath: game.path,
    }
  }

  return {
    projectPath: game.path,
    enginePath: engine.path,
    templatePath: await resolveBoundTemplatePath(config, engine),
  }
}

async function ensureEditorRuntimeCompatible(game: Pick<Game, 'engineId' | 'path'>): Promise<void> {
  const { config, engine } = await resolveBoundEngine(game)
  const isEngineBound = !!game.engineId || !!config?.engine

  assertBoundEngineEditorCompatible(isEngineBound, engine)
}

async function touchGameLastModified(gameId: string): Promise<void> {
  const lastModified = Date.now()
  await updateGameMonotonicLastModified(gameId, { lastModified })
}

async function refreshGamePreviewAssets(gameId: string, options?: GamePreviewRefreshOptions): Promise<void> {
  const game = await db.games.get(gameId)
  if (!game) {
    return
  }

  let previewAssets: GamePreviewAssets | undefined
  try {
    previewAssets = await getGamePreviewAssets(game.path)
  } catch (error) {
    logger.warn(`刷新游戏预览资源快照失败: ${error}`)
  }

  const cacheVersion = Date.now()
  await updateGameMonotonicLastModified(gameId, (latestGame) => {
    const patch: MonotonicGamePatch = {
      lastModified: cacheVersion,
    }
    if (previewAssets) {
      patch.previewAssets = mergeGamePreviewAssets(latestGame.previewAssets, previewAssets, options, cacheVersion)
    }
    return patch
  })
}

let touchLastModifiedTimer: ReturnType<typeof setTimeout> | undefined
const refreshPreviewAssetsTimers = new Map<string, ReturnType<typeof setTimeout>>()
const pendingPreviewInvalidations = new Map<string, GamePreviewInvalidation | undefined>()

/** 防抖更新当前游戏的 lastModified 字段（500ms） */
function touchCurrentGameLastModified(): void {
  const workspaceStore = useWorkspaceStore()
  const gameId = workspaceStore.currentGame?.id
  if (!gameId) {
    return
  }

  clearTimeout(touchLastModifiedTimer)
  touchLastModifiedTimer = setTimeout(async () => {
    try {
      await touchGameLastModified(gameId)
    } catch (error) {
      logger.error(`更新游戏 lastModified 失败: ${error}`)
    }
  }, 500)
}

/** 防抖刷新当前游戏的预览资源快照（500ms） */
function refreshCurrentGamePreviewAssets(options?: GamePreviewRefreshOptions): void {
  const workspaceStore = useWorkspaceStore()
  const gameId = workspaceStore.currentGame?.id
  if (!gameId) {
    return
  }

  pendingPreviewInvalidations.set(
    gameId,
    mergeGamePreviewInvalidation(pendingPreviewInvalidations.get(gameId), options?.invalidate),
  )
  clearTimeout(refreshPreviewAssetsTimers.get(gameId))

  const refreshPreviewAssetsTimer = setTimeout(async () => {
    const invalidate = pendingPreviewInvalidations.get(gameId)
    pendingPreviewInvalidations.delete(gameId)
    refreshPreviewAssetsTimers.delete(gameId)
    try {
      await refreshGamePreviewAssets(gameId, { invalidate })
    } catch (error) {
      logger.error(`刷新游戏预览资源快照失败: ${error}`)
    }
  }, 500)
  refreshPreviewAssetsTimers.set(gameId, refreshPreviewAssetsTimer)
}

export const gameManager = {
  validateGame,
  inspectGame,
  getGameMetadata,
  getGamePreviewAssets,
  getGameSnapshot,
  refreshRegisteredGameSnapshot,
  registerGame,
  createGame,
  deleteGame,
  relinkGame,
  prepareManagedImport,
  registerManagedImport,
  prepareManagedRelink,
  registerManagedRelink,
  renameGame,
  importGame,
  getGameEnginePath,
  resolvePreviewSite,
  resolveStaticAssetSite,
  ensureEditorRuntimeCompatible,
  touchGameLastModified,
  refreshGamePreviewAssets,
  touchCurrentGameLastModified,
  refreshCurrentGamePreviewAssets,
  identityKeyOf,
}
