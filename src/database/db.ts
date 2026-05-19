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
      games: 'id, &pathLookupKey, engineId, lastModified',
      engines: 'id, &pathLookupKey, [engineId+version]',
      templates: 'id, &pathLookupKey, metadata.name',
    })
  }
}

export const db = new WebGALCraftDatabase()
