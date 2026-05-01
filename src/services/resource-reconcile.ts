import { db } from '~/database/db'
import { engineManager } from '~/services/engine-manager'
import { gameManager } from '~/services/game-manager'
import { templateManager } from '~/services/template-manager'

import type { Engine, Game, Template } from '~/database/model'
import type { ResourceAvailability } from '~/services/resource-health'

// 三个 reconcile 函数结构一致：跑 inspect、若 availability 变化则落库、把最新结果回给调用方。
// 这里有意保持三份独立实现，避免为差异极小的资源类型引入泛型抽象。

async function reconcileGameRecord(game: Pick<Game, 'id' | 'path' | 'availability'>): Promise<ResourceAvailability> {
  try {
    const { availability } = await gameManager.inspectGame(game.path)
    if (game.availability !== availability) {
      await db.games.update(game.id, { availability })
    }
    return availability
  } catch (error) {
    logger.warn(`游戏校验异常: ${error}`)
    return game.availability
  }
}

async function reconcileEngineRecord(engine: Pick<Engine, 'id' | 'path' | 'availability'>): Promise<ResourceAvailability> {
  try {
    const { availability } = await engineManager.inspectEngine(engine.path)
    if (engine.availability !== availability) {
      await db.engines.update(engine.id, { availability })
    }
    return availability
  } catch (error) {
    logger.warn(`引擎校验异常: ${error}`)
    return engine.availability
  }
}

async function reconcileTemplateRecord(template: Pick<Template, 'id' | 'path' | 'availability' | 'metadata'>): Promise<ResourceAvailability> {
  try {
    const inspection = await templateManager.inspectTemplateAvailability(template.path)
    const patch: Partial<Template> = {}
    if (template.availability !== inspection.availability) {
      patch.availability = inspection.availability
    }
    if (inspection.metadata
      && (template.metadata.name !== inspection.metadata.name
        || template.metadata.webgalVersion !== inspection.metadata.webgalVersion)) {
      patch.metadata = inspection.metadata
    }
    if (Object.keys(patch).length > 0) {
      await db.templates.update(template.id, patch)
    }
    return inspection.availability
  } catch (error) {
    logger.warn(`模板校验异常: ${error}`)
    return template.availability
  }
}

async function reconcileAllGames(): Promise<void> {
  const games = await db.games.toArray()
  await Promise.all(games
    .filter(game => game.status === 'created')
    .map(game => reconcileGameRecord(game)))
}

export const resourceReconcile = {
  reconcileGameRecord,
  reconcileEngineRecord,
  reconcileTemplateRecord,
  reconcileAllGames,
}
