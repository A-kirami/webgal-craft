import { useObservable } from '@vueuse/rxjs'
import { liveQuery } from 'dexie'
import { from } from 'rxjs'

import { db } from '~/database/db'

import type { Engine, Game, Template } from '~/database/model'

export function useGames() {
  return useObservable<Game[]>(from(liveQuery(() => db.games.toArray())))
}

export function useEngines() {
  return useObservable<Engine[]>(from(liveQuery(() => db.engines.toArray())))
}

export function useTemplates() {
  return useObservable<Template[]>(from(liveQuery(() => db.templates.toArray())))
}
