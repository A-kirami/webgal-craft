import Dexie from 'dexie'

import type { Table } from 'dexie'
import type { Engine, Game, Template } from '~/database/model'

class WebGALCraftDatabase extends Dexie {
  games!: Table<Game, string>
  engines!: Table<Engine, string>
  templates!: Table<Template, string>

  constructor() {
    super('WebGALCraft')
    this.version(1).stores({
      games: 'id, &pathKey, path, engineId, createdAt, lastModified, status, availability',
      engines: 'id, &pathKey, path, engineId, name, [engineId+version], createdAt, status, availability',
      templates: 'id, path, createdAt, status, availability, metadata.name',
    })
  }
}

export const db = new WebGALCraftDatabase()
