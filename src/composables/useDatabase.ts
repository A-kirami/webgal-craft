import { useObservable } from '@vueuse/rxjs'
import { liveQuery } from 'dexie'
import { from } from 'rxjs'

export function useGames() {
  return useObservable<Game[]>(from(liveQuery(() => db.games.toArray())))
}

export function useEngines() {
  return useObservable<Engine[]>(from(liveQuery(() => db.engines.toArray())))
}
