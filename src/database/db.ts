import Dexie, { Table } from 'dexie'

class WebGALCraftDatabase extends Dexie {
  games!: Table<Game, string>
  engines!: Table<Engine, string>

  constructor() {
    super('WebGALCraft')
    this.version(1).stores({
      games: 'id, path, createdAt, lastModified, status',
      engines: 'id, path, createdAt, status',
    })
  }
}

export const db = new WebGALCraftDatabase()
