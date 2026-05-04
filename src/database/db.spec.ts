import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createTestEngine, createTestGame } from '~/__tests__/factories'

import { db } from './db'

async function resetDatabase() {
  db.close()
  await db.delete()
  await db.open()
}

describe('数据库 schema', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  afterEach(async () => {
    await resetDatabase()
  })

  it('games.pathKey 保持唯一', async () => {
    await db.games.add(createTestGame({
      id: 'game-1',
      path: '/Games/Demo',
    }))

    await expect(db.games.add(createTestGame({
      id: 'game-2',
      path: '/games/demo/',
    }))).rejects.toBeDefined()
  })

  it('engines.pathKey 保持唯一', async () => {
    await db.engines.add(createTestEngine({
      id: 'engine-1',
      path: '/Engines/WebGAL/4.5.0',
      engineId: 'open-webgal.webgal',
      version: '4.5.0',
    }))

    await expect(db.engines.add(createTestEngine({
      id: 'engine-2',
      path: '/engines/webgal/4.5.0/',
      engineId: 'open-webgal.webgal-copy',
      version: '4.5.1',
    }))).rejects.toBeDefined()
  })
})
