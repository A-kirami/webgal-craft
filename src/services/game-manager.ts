import { join } from '@tauri-apps/api/path'
import { exists, mkdir } from '@tauri-apps/plugin-fs'

import { fsCmds } from '~/commands/fs'
import { findGameConfigEntryValue, gameCmds } from '~/commands/game'
import { projectConfigCmds } from '~/commands/project-config'
import { vfsCmds } from '~/commands/vfs'
import { db } from '~/database/db'
import { Engine, Game } from '~/database/model'
import { engineManager, isEngineUsable } from '~/services/engine-manager'
import { gameConfigPath, gameCoverPath, gameIconPath, projectConfigPath } from '~/services/platform/app-paths'
import {
  classifyAvailability,
  createWarning,
  normalizeImportPath,
  ResourceHealthResult,
  ResourceWarning,
} from '~/services/resource-health'
import { templateSwitch } from '~/services/template-switch'
import { GameMetadata, GamePreviewAssets } from '~/services/types'
import { useResourceStore } from '~/stores/resource'
import { useWorkspaceStore } from '~/stores/workspace'
import { AppError } from '~/types/errors'
import { EngineRef, ProjectConfig, TemplateBinding } from '~/types/project-config'
import { toComparablePath } from '~/utils/path'

import type { GameConfigEntry } from '~/commands/game'
import type { StaticSiteConfig } from '~/types/server'

interface RegisterGameOptions {
  engineId?: string
  metadata?: GameMetadata
  previewAssets?: GamePreviewAssets
  status?: Game['status']
}

interface ImportGameOptions {
  selectEngine?: (hint?: EngineRef) => Promise<string | undefined>
}

export interface GameInspectionPayload {
  metadata: GameMetadata
  previewAssets: GamePreviewAssets
}

const GAME_NAME_RAW_KEY = 'Game_name'
const GAME_KEY_RAW_KEY = 'Game_key'
const TITLE_IMAGE_RAW_KEY = 'Title_img'

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

function buildGamePreviewAssets(titleImage: string | undefined): GamePreviewAssets {
  return {
    icon: {
      path: 'icons/favicon.ico',
    },
    cover: {
      path: titleImage ? `game/background/${titleImage}` : '',
    },
  }
}

async function validateGame(gamePath: string): Promise<boolean> {
  return exists(await gameConfigPath(gamePath))
}

async function getGameMetadata(gamePath: string): Promise<GameMetadata> {
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

async function getGamePreviewAssets(gamePath: string): Promise<GamePreviewAssets> {
  const metadata = await getGameMetadata(gamePath)
  return buildGamePreviewAssets(metadata.titleImg)
}

async function getGameSnapshot(gamePath: string): Promise<Pick<Game, 'metadata' | 'previewAssets'>> {
  const metadata = await getGameMetadata(gamePath)
  const cacheVersion = Date.now()

  return {
    metadata,
    previewAssets: withGamePreviewCacheVersion(
      buildGamePreviewAssets(metadata.titleImg),
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
  workspaceStore.currentGame = {
    ...current,
    ...patch,
    metadata: { ...current.metadata, ...patch.metadata },
    previewAssets: { ...current.previewAssets, ...patch.previewAssets },
  }
}

async function refreshRegisteredGameSnapshot(gamePath: string): Promise<void> {
  const game = await db.games.where('path').equals(gamePath).first()
  if (!game) {
    return
  }

  const snapshot = await getGameSnapshot(gamePath)
  const snapshotVersion = snapshot.previewAssets.icon.cacheVersion
    ?? snapshot.previewAssets.cover.cacheVersion
    ?? Date.now()
  const patch: Partial<Pick<Game, 'lastModified' | 'metadata' | 'previewAssets'>> = {
    lastModified: snapshotVersion,
    ...snapshot,
  }

  await db.games.update(game.id, patch)
  applyCurrentGamePatch(game.id, patch)
}

async function registerGame(
  gamePath: string,
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

function canAutoBindMatchedEngine(engine: Engine): boolean {
  return engine.status === 'created'
}

async function writeSelfContainedProjectConfig(gamePath: string): Promise<void> {
  await projectConfigCmds.writeProjectConfig(gamePath, { version: 1 })
}

async function readProjectConfigSafe(gamePath: string): Promise<ProjectConfig | undefined> {
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

async function resolveSelectableEngine(
  selectEngine: ImportGameOptions['selectEngine'],
  hint?: EngineRef,
): Promise<Engine> {
  if (!selectEngine) {
    throw new AppError('IO_ERROR', '项目缺少可用引擎，请重新导入并选择引擎', {
      details: { reason: 'ENGINE_SELECTION_REQUIRED' },
    })
  }

  const engineId = await selectEngine(hint)
  if (!engineId) {
    throw new AppError('IO_ERROR', '导入已取消', {
      details: { reason: 'IMPORT_CANCELLED' },
    })
  }

  const engine = await db.engines.get(engineId)
  if (!engine) {
    throw new AppError('IO_ERROR', '引擎不存在', {
      details: { reason: 'ENGINE_NOT_FOUND' },
    })
  }

  if (!isEngineUsable(engine)) {
    throw new AppError('IO_ERROR', '引擎不可用', {
      details: { reason: 'ENGINE_UNAVAILABLE' },
    })
  }

  return engine
}

async function importLegacyGame(
  gamePath: string,
  options: ImportGameOptions,
): Promise<string> {
  const hasIndexHtml = await exists(await join(gamePath, 'index.html'))

  if (hasIndexHtml) {
    await writeSelfContainedProjectConfig(gamePath)
    return registerGame(gamePath)
  }

  const engine = await resolveSelectableEngine(options.selectEngine)
  await projectConfigCmds.writeProjectConfig(gamePath, {
    version: 1,
    engine: buildProjectEngineRef(engine),
  })

  return registerGame(gamePath, { engineId: engine.id })
}

async function importConfiguredGame(
  gamePath: string,
  options: ImportGameOptions,
): Promise<string> {
  let config: ProjectConfig

  try {
    config = await projectConfigCmds.readProjectConfig(gamePath)
  } catch (error) {
    // 仅处理 INVALID_PROJECT_CONFIG，其他错误（含 SCHEMA_VERSION_TOO_NEW）直接上抛
    if (!(error instanceof AppError) || error.code !== 'INVALID_PROJECT_CONFIG') {
      throw error
    }

    if (await exists(await join(gamePath, 'index.html'))) {
      logger.warn(`project.wgcp 解析失败，但检测到自带引擎，按自带引擎项目导入: ${gamePath}`)
      await writeSelfContainedProjectConfig(gamePath)
      return await registerGame(gamePath)
    }

    throw new AppError('INVALID_PROJECT_CONFIG', '项目配置文件损坏', {
      details: { reason: 'CONFIG_CORRUPTED' },
    })
  }

  // 无引擎配置：自带引擎项目 或 让用户选择引擎
  if (!config.engine) {
    if (await exists(await join(gamePath, 'index.html'))) {
      return registerGame(gamePath)
    }

    logger.warn(`engine 字段缺失且 index.html 不存在，引导用户选择引擎: ${gamePath}`)
    return await bindSelectedEngine(gamePath, config, options)
  }

  // 有引擎配置：尝试自动匹配已注册引擎
  const matchedEngine = await engineManager.findEngineByRef(config.engine)
  if (matchedEngine && canAutoBindMatchedEngine(matchedEngine)) {
    if (matchedEngine.availability !== 'available') {
      logger.warn(`关联的引擎 ${matchedEngine.name} 当前不可用，项目预览将受限: ${gamePath}`)
    }
    return registerGame(gamePath, { engineId: matchedEngine.id })
  }

  return await bindSelectedEngine(gamePath, config, options, config.engine)
}

/** 让用户选择引擎，写入配置并注册游戏 */
async function bindSelectedEngine(
  gamePath: string,
  config: ProjectConfig,
  options: ImportGameOptions,
  hint?: EngineRef,
): Promise<string> {
  const engine = await resolveSelectableEngine(options.selectEngine, hint)
  await projectConfigCmds.writeProjectConfig(gamePath, {
    ...config,
    engine: buildProjectEngineRef(engine),
  })
  return registerGame(gamePath, { engineId: engine.id })
}

interface CreateGameOptions {
  onProgress?: (progress: number) => void
  templateBinding?: TemplateBinding
}

async function createGame(gameName: string, gamePath: string, engineId: string, options: CreateGameOptions = {}): Promise<string> {
  const resourceStore = useResourceStore()
  const engine = await db.engines.get(engineId)
  if (!engine) {
    throw new AppError('IO_ERROR', '引擎不存在')
  }

  if (!isEngineUsable(engine)) {
    throw new AppError('IO_ERROR', '引擎不可用')
  }

  const templateBinding = options.templateBinding

  const targetExisted = await exists(gamePath)
  let gameId: string | undefined

  try {
    // 先创建目录和项目配置，确保 preview primer 触发时路径已存在且 VFS 可解析引擎层资源
    await mkdir(await join(gamePath, 'game'), { recursive: true })
    await projectConfigCmds.writeProjectConfig(gamePath, {
      version: 1,
      engine: buildProjectEngineRef(engine),
      ...(templateBinding ? { template: templateBinding } : {}),
    })

    // 读取引擎默认配置获取初始预览资源路径，使创建中也能通过引擎 serve URL 显示封面和图标
    let initialPreviewAssets: GamePreviewAssets
    try {
      const engineConfig = await gameCmds.getGameConfig(engine.path)
      const titleImg = findGameConfigEntryValue(engineConfig.entries, TITLE_IMAGE_RAW_KEY) ?? ''
      initialPreviewAssets = buildGamePreviewAssets(titleImg)
    } catch {
      initialPreviewAssets = buildGamePreviewAssets(undefined)
    }

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
    const engineGameDir = await join(engine.path, 'game')
    if (await exists(engineGameDir)) {
      const projectGameDir = await join(gamePath, 'game')
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

    return gameId
  } catch (error) {
    logger.error(`创建游戏失败: ${error}`)
    if (gameId) {
      resourceStore.finishProgress(gameId)
      await db.games.delete(gameId).catch((error_) => {
        logger.warn(`[游戏创建] 清理异常 - 删除记录失败: ${error_}`)
      })
    }
    if (!targetExisted && await exists(gamePath)) {
      await fsCmds.deleteFile(gamePath, true).catch((error_) => {
        logger.warn(`[游戏创建] 清理异常 - 删除目录失败: ${error_}`)
      })
    }
    throw error
  }
}

async function deleteGame(game: Game, removeFiles: boolean = false): Promise<void> {
  if (removeFiles) {
    await fsCmds.deleteFile(game.path)
  }
  await db.games.delete(game.id)
}

/**
 * 把游戏记录指向新的目录路径。第一版不做 gameKey 身份校验，只要新路径是合法游戏目录即可，
 * 对应的会话状态由调用方负责清理。
 */
async function relinkGame(gameId: string, newPath: string): Promise<Game> {
  const game = await db.games.get(gameId)
  if (!game) {
    throw new AppError('IO_ERROR', '游戏不存在')
  }

  const inspection = await inspectGame(newPath)
  if (inspection.availability !== 'available') {
    throw new AppError('INVALID_STRUCTURE', '所选目录不是合法的游戏文件夹')
  }

  const patch: Partial<Game> = {
    path: inspection.normalizedPath,
    availability: 'available',
    lastModified: Date.now(),
    ...inspection.payload,
  }
  await db.games.update(gameId, patch)

  return { ...game, ...patch }
}

async function getGameEnginePath(game: Pick<Game, 'engineId' | 'path'>): Promise<string | undefined> {
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
    relPath: 'game/config.txt',
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

async function findExistingGameByPath(rawPath: string): Promise<Game | undefined> {
  const { comparablePath } = normalizeImportPath(rawPath)
  const games = await db.games.toArray()
  return games.find(game => toComparablePath(game.path) === comparablePath)
}

async function collectGameWarnings(
  gamePath: string,
  metadata: GameMetadata,
): Promise<ResourceWarning[]> {
  const warnings: ResourceWarning[] = []

  if (!metadata.name?.trim()) {
    warnings.push(createWarning('missing-game-name', '游戏未配置 Game_name'))
  }

  if (!(await exists(await gameIconPath(gamePath)))) {
    warnings.push(createWarning('missing-favicon', '游戏 favicon 不存在'))
  }

  const titleImg = metadata.titleImg?.trim()
  if (!titleImg) {
    warnings.push(createWarning('missing-title-image', '游戏未配置 Title_img'))
  } else if (!(await exists(await gameCoverPath(gamePath, titleImg)))) {
    warnings.push(createWarning('missing-title-image-file', `Title_img 指向的文件不存在: ${titleImg}`))
  }

  return warnings
}

async function inspectGame(
  rawPath: string,
): Promise<ResourceHealthResult<GameInspectionPayload>> {
  const { normalizedPath, comparablePath } = normalizeImportPath(rawPath)

  if (!(await exists(normalizedPath))) {
    return {
      availability: 'missing',
      warnings: [],
      blockingIssue: { code: 'DIR_NOT_FOUND', message: '游戏目录不存在' },
      normalizedPath,
      comparablePath,
    }
  }

  if (!(await exists(await gameConfigPath(normalizedPath)))) {
    return {
      availability: 'broken',
      warnings: [],
      blockingIssue: { code: 'INVALID_STRUCTURE', message: '无效的游戏文件夹' },
      normalizedPath,
      comparablePath,
    }
  }

  let metadata: GameMetadata
  try {
    metadata = await getGameMetadata(normalizedPath)
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
      comparablePath,
    }
  }
  const warnings = await collectGameWarnings(normalizedPath, metadata)

  return {
    availability: classifyAvailability({
      pathExists: true,
      structureValid: true,
      semanticsValid: true,
    }),
    warnings,
    payload: {
      metadata,
      previewAssets: withGamePreviewCacheVersion(buildGamePreviewAssets(metadata.titleImg)),
    },
    normalizedPath,
    comparablePath,
  }
}

export interface ImportGameResult {
  id: string
  alreadyRegistered: boolean
}

async function importGame(gamePath: string, options: ImportGameOptions = {}): Promise<ImportGameResult> {
  const { normalizedPath } = normalizeImportPath(gamePath)

  // 幂等：已注册路径直接返回既有 ID（按归一化后路径比较）
  const existing = await findExistingGameByPath(normalizedPath)
  if (existing) {
    return { id: existing.id, alreadyRegistered: true }
  }

  if (!(await validateGame(normalizedPath))) {
    logger.error(`[游戏导入] 无效的游戏文件夹: ${normalizedPath}`)
    throw new AppError('INVALID_STRUCTURE', '无效的游戏文件夹')
  }

  const id = await exists(await projectConfigPath(normalizedPath))
    ? await importConfiguredGame(normalizedPath, options)
    : await importLegacyGame(normalizedPath, options)
  return { id, alreadyRegistered: false }
}

async function resolvePreviewSite(game: Pick<Game, 'engineId' | 'path'>): Promise<StaticSiteConfig> {
  const { config, engine } = await resolveBoundEngine(game)
  const isEngineBound = !!game.engineId || !!config?.engine

  if (isEngineBound && (!engine || !isEngineUsable(engine))) {
    throw new AppError('IO_ERROR', '引擎不可用')
  }

  const templatePath = config?.engine
    ? await templateSwitch.resolveTemplatePath(config.template, engine)
    : undefined

  return {
    projectPath: game.path,
    enginePath: engine?.path,
    templatePath,
  }
}

async function updateGameLastModified(gameId: string): Promise<void> {
  const cacheVersion = Date.now()
  const patch: Partial<Pick<Game, 'lastModified' | 'previewAssets'>> = {
    lastModified: cacheVersion,
  }

  const game = await db.games.get(gameId)
  if (!game) {
    return
  }

  try {
    patch.previewAssets = withGamePreviewCacheVersion(
      await getGamePreviewAssets(game.path),
      cacheVersion,
    )
  } catch (error) {
    if (game.previewAssets) {
      patch.previewAssets = withGamePreviewCacheVersion(game.previewAssets, cacheVersion)
    }
    logger.warn(`刷新游戏预览资源快照失败: ${error}`)
  }

  await db.games.update(gameId, patch)
  applyCurrentGamePatch(gameId, patch)
}

let lastModifiedTimer: ReturnType<typeof setTimeout> | undefined

/** 防抖更新当前游戏的 lastModified 字段（500ms） */
function updateCurrentGameLastModified(): void {
  const workspaceStore = useWorkspaceStore()
  const gameId = workspaceStore.currentGame?.id
  if (!gameId) {
    return
  }

  clearTimeout(lastModifiedTimer)
  lastModifiedTimer = setTimeout(async () => {
    try {
      await updateGameLastModified(gameId)
    } catch (error) {
      logger.error(`更新游戏 lastModified 失败: ${error}`)
    }
  }, 500)
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
  renameGame,
  importGame,
  getGameEnginePath,
  resolvePreviewSite,
  updateGameLastModified,
  updateCurrentGameLastModified,
}
