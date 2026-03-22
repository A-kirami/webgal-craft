import { useObservable } from '@vueuse/rxjs'
import { liveQuery } from 'dexie'
import { from } from 'rxjs'

import { db } from '~/database/db'
import { Engine, Game } from '~/database/model'

export function useGames() {
  return useObservable<Game[]>(from(liveQuery(() => db.games.toArray())))
}

export function useEngines() {
  return useObservable<Engine[]>(from(liveQuery(() => db.engines.toArray())))
}
